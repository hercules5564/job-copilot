import { Router } from "express";
import { prisma } from "@jobcopilot/db";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok", service: "api", time: new Date().toISOString() });
});

healthRouter.get("/db", async (_req, res) => {
  if (!process.env.DATABASE_URL) {
    res.json({ status: "skipped", reason: "DATABASE_URL not set (stub mode)" });
    return;
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  } catch (err) {
    res.status(503).json({ status: "error", reason: String(err).slice(0, 200) });
  }
});
