import { Router } from "express";
import { UpdateProfileSchema } from "@jobcopilot/shared";
import { validateBody } from "../middleware/validate.js";
import { ah } from "../middleware/db.js";
import { getProfile, upsertProfile, deleteProfile } from "../services/profiles.js";

export const profileRouter = Router();

profileRouter.get(
  "/",
  ah(async (req, res) => {
    res.json({ profile: await getProfile(req.userId!) });
  }),
);

profileRouter.put(
  "/",
  validateBody(UpdateProfileSchema),
  ah(async (req, res) => {
    res.json({ profile: await upsertProfile(req.userId!, req.body) });
  }),
);

profileRouter.delete(
  "/",
  ah(async (req, res) => {
    await deleteProfile(req.userId!);
    res.json({ ok: true });
  }),
);
