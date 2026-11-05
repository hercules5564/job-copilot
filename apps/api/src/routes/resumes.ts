import express, { Router } from "express";
import {
  ConfirmExtractionSchema,
  CreateResumeSchema,
  UpdateResumeSchema,
} from "@jobcopilot/shared";
import { validateBody } from "../middleware/validate.js";
import { ah } from "../middleware/db.js";
import {
  listResumes,
  getResume,
  createResume,
  createUploadedResume,
  updateResume,
  deleteResume,
  listResumeVersions,
} from "../services/resumes.js";
import { badRequest, notFound } from "../services/errors.js";
import {
  DOCX_MIME,
  MAX_UPLOAD_BYTES,
  PDF_MIME,
  readDocument,
  saveDocument,
  type ResumeFileKind,
} from "../services/resume-storage.js";
import { getResumeExtraction, parseResume } from "../services/resume-parser.js";
import { confirmExtraction } from "../services/candidate-profile.js";

export const resumesRouter = Router();

function header(req: express.Request, name: string): string {
  const raw = req.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return "";
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

/**
 * Raw-body upload (PDF/DOCX). The UI sends the file bytes directly with
 * Content-Type set; no multipart dependency is needed. Bytes are validated
 * by magic number, size-capped, stored privately, then parsed.
 */
resumesRouter.post(
  "/upload",
  express.raw({
    type: [PDF_MIME, DOCX_MIME],
    limit: MAX_UPLOAD_BYTES + 1024,
  }),
  ah(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw badRequest(
        "Send the document as the raw request body with Content-Type application/pdf or the DOCX type.",
      );
    }
    const kindHeader = header(req, "x-resume-kind").toUpperCase();
    const kind: ResumeFileKind = kindHeader === "PORTFOLIO" ? "PORTFOLIO" : "RESUME";
    const originalName = header(req, "x-file-name") || `${kind.toLowerCase()}.pdf`;
    const stored = await saveDocument({
      userId: req.userId!,
      kind,
      originalName,
      buffer: req.body,
    });
    const requestedName = header(req, "x-resume-name");
    const resume = await createUploadedResume(req.userId!, {
      name: requestedName || stored.originalName,
      kind,
      storageKey: stored.storageKey,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      originalName: stored.originalName,
    });

    let extraction = null;
    let provider: "ai" | "heuristic" | null = null;
    let parseError: string | null = null;
    if (kind === "RESUME") {
      try {
        const parsed = await parseResume(req.userId!, resume.id);
        extraction = parsed.extraction;
        provider = parsed.provider;
      } catch (err) {
        parseError = err instanceof Error ? err.message : "Could not analyse this document.";
      }
    }
    res.status(201).json({
      resume: await getResume(req.userId!, resume.id),
      extraction,
      provider,
      parseError,
    });
  }),
);

resumesRouter.get(
  "/:id/download",
  ah(async (req, res) => {
    const resume = await getResume(req.userId!, req.params.id);
    if (!resume.storageKey) throw notFound("No document is stored for this resume.");
    const buffer = await readDocument(resume.storageKey);
    const filename = encodeURIComponent(resume.originalName ?? resume.name);
    res.setHeader("Content-Type", resume.mimeType ?? "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${resume.originalName ?? "document"}"; filename*=UTF-8''${filename}`,
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(buffer);
  }),
);

resumesRouter.post(
  "/:id/parse",
  ah(async (req, res) => {
    const parsed = await parseResume(req.userId!, req.params.id);
    res.json({
      extraction: parsed.extraction,
      provider: parsed.provider,
      resume: await getResume(req.userId!, req.params.id),
    });
  }),
);

resumesRouter.get(
  "/:id/extraction",
  ah(async (req, res) => {
    res.json({
      resume: await getResume(req.userId!, req.params.id),
      extraction: await getResumeExtraction(req.userId!, req.params.id),
    });
  }),
);

resumesRouter.put(
  "/:id/extraction",
  validateBody(ConfirmExtractionSchema),
  ah(async (req, res) => {
    const result = await confirmExtraction(req.userId!, req.params.id, req.body);
    res.json({ ...result, resume: await getResume(req.userId!, req.params.id) });
  }),
);

resumesRouter.get(
  "/",
  ah(async (req, res) => {
    res.json({ resumes: await listResumes(req.userId!) });
  }),
);

resumesRouter.post(
  "/",
  validateBody(CreateResumeSchema),
  ah(async (req, res) => {
    res.status(201).json({ resume: await createResume(req.userId!, req.body) });
  }),
);

resumesRouter.get(
  "/:id",
  ah(async (req, res) => {
    res.json({ resume: await getResume(req.userId!, req.params.id) });
  }),
);

resumesRouter.patch(
  "/:id",
  validateBody(UpdateResumeSchema),
  ah(async (req, res) => {
    res.json({ resume: await updateResume(req.userId!, req.params.id, req.body) });
  }),
);

resumesRouter.delete(
  "/:id",
  ah(async (req, res) => {
    await deleteResume(req.userId!, req.params.id);
    res.json({ ok: true });
  }),
);

resumesRouter.get(
  "/:id/versions",
  ah(async (req, res) => {
    res.json({ versions: await listResumeVersions(req.userId!, req.params.id) });
  }),
);
