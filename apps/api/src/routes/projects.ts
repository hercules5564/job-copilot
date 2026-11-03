import { Router } from "express";
import { CreateProjectSchema, UpdateProjectSchema } from "@jobcopilot/shared";
import { validateBody } from "../middleware/validate.js";
import { ah } from "../middleware/db.js";
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
} from "../services/projects.js";

export const projectsRouter = Router();

projectsRouter.get(
  "/",
  ah(async (req, res) => {
    res.json({ projects: await listProjects(req.userId!) });
  }),
);

projectsRouter.post(
  "/",
  validateBody(CreateProjectSchema),
  ah(async (req, res) => {
    res.status(201).json({ project: await createProject(req.userId!, req.body) });
  }),
);

projectsRouter.get(
  "/:id",
  ah(async (req, res) => {
    res.json({ project: await getProject(req.userId!, req.params.id) });
  }),
);

projectsRouter.patch(
  "/:id",
  validateBody(UpdateProjectSchema),
  ah(async (req, res) => {
    res.json({ project: await updateProject(req.userId!, req.params.id, req.body) });
  }),
);

projectsRouter.delete(
  "/:id",
  ah(async (req, res) => {
    await deleteProject(req.userId!, req.params.id);
    res.json({ ok: true });
  }),
);
