import { Router } from "express";
import { prisma } from "@jobcopilot/db";
import { HiringSignalQuerySchema } from "@jobcopilot/shared";
import { ah, requireDb } from "../middleware/db.js";
import { notFound } from "../services/errors.js";

/**
 * Phase 10B — user-scoped hiring-signal reads. Signals are created by
 * discovery only (no creation endpoint); evidence fields are safe by
 * construction. Foreign ids return 404 (no existence oracle).
 *
 * Phase 13 (C3 Leads inbox) — additive read-only extensions, all bounded
 * and Zod-validated: `source` exact filter, `search` substring match over
 * company/title/source, `offset` pagination, plus related-job and
 * related-application references resolved owner-scoped (never trusted
 * from client input). No new tables, no behavior changes to discovery.
 */
export const signalsRouter = Router();

signalsRouter.use(requireDb);

type SignalRow = {
  id: string;
  companyId: string | null;
  companyName: string;
  source: string;
  type: string;
  title: string;
  url: string | null;
  evidenceSummary: string | null;
  confidence: number;
  relatedJobId: string | null;
  detectedAt: Date;
  createdAt: Date;
};

type RelatedJobRef = {
  id: string;
  title: string;
  companyName: string;
} | null;

function serialize(
  row: SignalRow,
  relatedJob: RelatedJobRef = null,
  applicationId: string | null = null,
) {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.companyName,
    source: row.source,
    type: row.type,
    title: row.title,
    url: row.url,
    evidenceSummary: row.evidenceSummary,
    confidence: row.confidence,
    relatedJobId: row.relatedJobId,
    relatedJob,
    applicationId,
    detectedAt: row.detectedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Owner-scoped application lookup: jobId -> applicationId for this user. */
async function resolveApplicationIds(
  userId: string,
  jobIds: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(jobIds.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const apps = await prisma.application.findMany({
    where: { userId, jobId: { in: unique } },
    select: { id: true, jobId: true },
  });
  return new Map(apps.map((a) => [a.jobId, a.id]));
}

signalsRouter.get(
  "/",
  ah(async (req, res) => {
    const parsed = HiringSignalQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const { type, company, source, search, limit, offset } = parsed.data;
    const signals = await prisma.hiringSignal.findMany({
      where: {
        userId: req.userId!,
        ...(type ? { type } : {}),
        ...(company ? { companyName: { contains: company, mode: "insensitive" } } : {}),
        ...(source ? { source } : {}),
        ...(search
          ? {
              OR: [
                { companyName: { contains: search, mode: "insensitive" } },
                { title: { contains: search, mode: "insensitive" } },
                { source: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { detectedAt: "desc" },
      skip: offset,
      take: limit,
      include: {
        relatedJob: { select: { id: true, title: true, companyName: true } },
      },
    });
    const appIds = await resolveApplicationIds(
      req.userId!,
      signals.map((s) => s.relatedJobId),
    );
    res.json({
      signals: signals.map((s) =>
        serialize(s, s.relatedJob ?? null, s.relatedJobId ? (appIds.get(s.relatedJobId) ?? null) : null),
      ),
    });
  }),
);

signalsRouter.get(
  "/:id",
  ah(async (req, res) => {
    const row = await prisma.hiringSignal.findFirst({
      where: { id: req.params.id, userId: req.userId! },
      include: {
        relatedJob: { select: { id: true, title: true, companyName: true } },
      },
    });
    if (!row) throw notFound("Hiring signal not found");
    const appIds = await resolveApplicationIds(req.userId!, [row.relatedJobId]);
    res.json({
      signal: serialize(
        row,
        row.relatedJob ?? null,
        row.relatedJobId ? (appIds.get(row.relatedJobId) ?? null) : null,
      ),
    });
  }),
);
