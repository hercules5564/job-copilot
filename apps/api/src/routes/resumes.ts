import { Router } from "express";
import { CreateResumeSchema, UpdateResumeSchema } from "@jobcopilot/shared";
import { validateBody } from "../middleware/validate.js";
import { ah } from "../middleware/db.js";
import {
  listResumes,
  getResume,
  createResume,
  updateResume,
  deleteResume,
  listResumeVersions,
} from "../services/resumes.js";

export const resumesRouter = Router();

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
