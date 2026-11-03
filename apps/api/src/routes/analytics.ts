import { Router } from "express";
import { ah, requireDb } from "../middleware/db.js";
import { getAnalyticsOverview } from "../services/analytics.js";

export const analyticsRouter = Router();

analyticsRouter.use(requireDb);

/** Descriptive, owner-scoped aggregates for /analytics. No predictions. */
analyticsRouter.get(
  "/",
  ah(async (req, res) => {
    res.json({ analytics: await getAnalyticsOverview(req.userId!) });
  }),
);
