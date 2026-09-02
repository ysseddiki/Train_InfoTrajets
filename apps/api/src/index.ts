import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import type { HealthResponse } from "@sncf-alerts/shared";
import { createIngestAdapter } from "./adapters/ingest.js";
import { migrate } from "./db/pool.js";
import { loadRepoEnv } from "./domain/env.js";
import { getFeatureFlags } from "./domain/feature-flags.js";
import { parseCorsOrigins } from "./domain/cors-origin.js";
import { registerAdminGuard } from "./domain/admin-guard.js";
import { checkReadRateLimit } from "./domain/rate-limit.js";
import { productionModeWarning } from "./domain/runtime-mode.js";
import { parseTrustedProxies } from "./domain/trusted-proxies.js";
import { store } from "./domain/store.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";

loadRepoEnv();

const port = Number(process.env.API_PORT ?? 3001);
/**
 * Écoute locale par défaut : le reverse-proxy porte TLS, HSTS, CSP et `limit_req`.
 * Exposer l'API directement les contournerait — `API_HOST=0.0.0.0` doit rester un choix
 * explicite, accompagné d'un pare-feu fermé.
 */
const host = process.env.API_HOST ?? "127.0.0.1";

async function main() {
  await migrate();
  await store.seed();

  const app = Fastify({
    trustProxy: parseTrustedProxies(process.env.TRUSTED_PROXIES),
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

  const corsAllowlist = parseCorsOrigins(process.env.CORS_ORIGINS);
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true);
        return;
      }
      if (corsAllowlist.includes(origin)) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
    credentials: true,
  });
  await app.register(cookie);
  await registerAdminGuard(app);

  const warning = productionModeWarning();
  if (warning) app.log.warn(warning);

  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/v1/")) return;
    const rate = checkReadRateLimit(req.ip);
    if (rate.allowed) return;
    reply.header("Retry-After", String(rate.retryAfterSec));
    return reply.code(429).send({
      type: "/errors/rate-limit",
      title: "Too many requests",
      status: 429,
      retryAfterSec: rate.retryAfterSec,
    });
  });

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

  await registerAuthRoutes(app);
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
