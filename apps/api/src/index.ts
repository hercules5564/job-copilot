import { createApp } from "./app.js";
import { config } from "./config.js";
import { isDbConfigured, prisma } from "@jobcopilot/db";

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(JSON.stringify({ level: "info", msg: `api listening on :${config.port}` }));
});

// Phase 17 — bounded graceful shutdown: stop accepting requests, then
// disconnect Prisma and exit. Matches the worker's bounded-shutdown
// convention (no long hangs; Windows delivers SIGINT reliably, SIGTERM
// where the host supports it).
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ level: "info", msg: "api shutdown started", signal }));
  const force = setTimeout(() => process.exit(1), 10000);
  (force as unknown as { unref?: () => void }).unref?.();
  server.close(() => {
    void (async () => {
      try {
        if (isDbConfigured()) await prisma.$disconnect();
        clearTimeout(force);
        console.log(JSON.stringify({ level: "info", msg: "api shutdown complete" }));
        process.exit(0);
      } catch {
        clearTimeout(force);
        process.exit(1);
      }
    })();
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
