import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import type { HealthResponse } from "@sncf-alerts/shared";
import { createIngestAdapter } from "./adapters/ingest.js";
import { migrate } from "./db/pool.js";
import { loadRepoEnv } from "./domain/env.js";
import { getFeatureFlags } from "./domain/feature-flags.js";
import { store } from "./domain/store.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";

loadRepoEnv();

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
          "body.currentPassword",
          "body.newPassword",
          "SMTP_PASSWORD",
          "TEAMS_WEBHOOK_URL",
          "body.token",
          "NAVITIA_TOKEN",
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

  app.get("/v1/health", async (): Promise<HealthResponse> => {
    const flags = await getFeatureFlags();
    return {
      status: "ok",
      version: "0.2.0",
      ingestProvider: flags.ingestProvider,
      flags: {
        ingestInProcess: flags.ingestInProcess,
        prometheusEnabled: flags.prometheusEnabled,
      },
    };
  });

  await registerDashboardRoutes(app);
  await registerAdminRoutes(app);

  const ingestInProcess = process.env.INGEST_IN_PROCESS !== "false";
  if (ingestInProcess) {
    const ingest = createIngestAdapter();
    const tick = async () => {
      try {
        await ingest.poll();
      } catch (err) {
        app.log.error({ err }, "ingest poll failed");
      }
      const waitMs = await store.getIngestPollIntervalMs();
      setTimeout(() => {
        void tick();
      }, waitMs);
    };
    void tick();
    app.log.info(
      {
        pollSeconds: await store.getIngestPollIntervalSeconds(),
      },
      "Ingest loop running in API process (interval per provider)",
    );
  } else {
    app.log.info(
      "INGEST_IN_PROCESS=false — use sncf-alerts-ingest.service for polling",
    );
  }

  await app.listen({ port, host });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
