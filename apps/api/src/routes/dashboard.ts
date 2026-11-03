import { Router } from "express";
import { ah } from "../middleware/db.js";
import { getStats } from "../services/dashboard.js";

export const dashboardRouter = Router();

/** Aggregated counts for /dashboard. Prisma-backed when DATABASE_URL is set. */
dashboardRouter.get(
  "/stats",
  ah(async (req, res) => {
    res.json(await getStats(req.userId!));
  }),
);
