import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import type { HealthResponse } from "@sncf-alerts/shared";
import { createIngestAdapter } from "./adapters/ingest.js";
import { migrate } from "./db/pool.js";
import { store } from "./domain/store.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";

// Load repo-root .env (apps/api → ../..)
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
loadEnv({ path: path.join(repoRoot, ".env") });

const port = Number(process.env.API_PORT ?? 3001);
const host = process.env.API_HOST ?? "0.0.0.0";

async function main() {
  await migrate();
  await store.seed();

  const app = Fastify({
    logger: {
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "body.password",
          "SMTP_PASSWORD",
          "TEAMS_WEBHOOK_URL",
        ],
        remove: true,
      },
    },
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });
  await app.register(cookie);

  app.get("/v1/health", async (): Promise<HealthResponse> => ({
    status: "ok",
    version: "0.2.0",
    ingestProvider: process.env.INGEST_PROVIDER ?? "stub",
  }));

  await registerDashboardRoutes(app);
  await registerAdminRoutes(app);

  const ingest = createIngestAdapter();
  const intervalMs = Number(process.env.INGEST_INTERVAL_MS ?? 60_000);
  setInterval(() => {
    void ingest.poll().catch((err) => {
      app.log.error({ err }, "ingest poll failed");
    });
  }, intervalMs);

  await app.listen({ port, host });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
