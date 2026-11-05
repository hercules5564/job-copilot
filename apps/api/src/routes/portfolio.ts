import { Router } from "express";
import { AnalyzePortfolioSchema } from "@jobcopilot/shared";
import { validateBody } from "../middleware/validate.js";
import { ah } from "../middleware/db.js";
import { analyzePortfolio } from "../services/portfolio.js";

export const portfolioRouter = Router();

/**
 * Analyse a public portfolio/GitHub URL. Inaccessible pages return
 * `accessible: false` with a clear error instead of invented projects.
 */
portfolioRouter.post(
  "/analyze",
  validateBody(AnalyzePortfolioSchema),
  ah(async (req, res) => {
    const analysis = await analyzePortfolio(req.userId!, req.body.url);
    res.json({ analysis });
  }),
);
