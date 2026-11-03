import { Router } from "express";
import { EditDraftRequestSchema, GenerateDraftRequestSchema } from "@jobcopilot/shared";
import { ah, requireDb } from "../middleware/db.js";
import { validateBody } from "../middleware/validate.js";
import {
  approveDraft,
  editDraft,
  generateDraft,
  generationStatus,
  getApprovedDraft,
  getDraft,
  listDrafts,
  rejectDraft,
} from "../services/personalization.js";
import { GenerationError, GenerationNotConfiguredError } from "../services/generation.js";

/**
 * Phase 15 — AI application-personalization reads/writes, nested under
 * applications (`mergeParams`). Every query is user-scoped; foreign
 * application/draft ids return 404. Approval flips draft status only —
 * never submits, automates, emails, or touches browser automation.
 */
export const personalizationRouter = Router({ mergeParams: true });

/** Provider configuration state (no secrets, no DB required). */
personalizationRouter.get(
  "/:id/personalization/status",
  ah(async (_req, res) => {
    res.json({ status: generationStatus() });
  }),
);

personalizationRouter.use("/:id/personalization", requireDb);

function generationFailure(res: { status: (code: number) => { json: (body: unknown) => void } }, err: unknown): boolean {
  if (err instanceof GenerationNotConfiguredError) {
    res.status(409).json({ error: err.message, configured: false });
    return true;
  }
  if (err instanceof GenerationError) {
    res.status(502).json({ error: err.message });
    return true;
  }
  return false;
}

personalizationRouter.post(
  "/:id/personalization/generate",
  validateBody(GenerateDraftRequestSchema),
  ah(async (req, res) => {
    try {
      const draft = await generateDraft(req.userId!, req.params.id, req.body);
      res.status(201).json({ draft });
    } catch (err) {
      if (generationFailure(res as never, err)) return;
      throw err;
    }
  }),
);

personalizationRouter.get(
  "/:id/personalization/drafts",
  ah(async (req, res) => {
    res.json({ drafts: await listDrafts(req.userId!, req.params.id) });
  }),
);

/**
 * Phase 16 — latest APPROVED draft for application-assistance use.
 * REVIEW_REQUIRED (or older approved) content is never served here:
 * `{ draft: null }` when nothing is approved.
 */
personalizationRouter.get(
  "/:id/personalization/approved",
  ah(async (req, res) => {
    res.json({ draft: await getApprovedDraft(req.userId!, req.params.id) });
  }),
);

personalizationRouter.get(
  "/:id/personalization/drafts/:draftId",
  ah(async (req, res) => {
    res.json({ draft: await getDraft(req.userId!, req.params.id, req.params.draftId) });
  }),
);

personalizationRouter.patch(
  "/:id/personalization/drafts/:draftId",
  validateBody(EditDraftRequestSchema),
  ah(async (req, res) => {
    res.json({
      draft: await editDraft(req.userId!, req.params.id, req.params.draftId, req.body),
    });
  }),
);

personalizationRouter.post(
  "/:id/personalization/drafts/:draftId/approve",
  ah(async (req, res) => {
    res.json({ draft: await approveDraft(req.userId!, req.params.id, req.params.draftId) });
  }),
);

personalizationRouter.post(
  "/:id/personalization/drafts/:draftId/reject",
  ah(async (req, res) => {
    res.json({ draft: await rejectDraft(req.userId!, req.params.id, req.params.draftId) });
  }),
);
