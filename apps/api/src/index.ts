import Fastify from "fastify";
import type { HealthResponse } from "@sncf-alerts/shared";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { registerAdminRoutes } from "./routes/admin.js";

const port = Number(process.env.API_PORT ?? 3001);
const host = process.env.API_HOST ?? "0.0.0.0";

async function main() {
  const app = Fastify({ logger: true });

  app.get("/v1/health", async (): Promise<HealthResponse> => ({
    status: "ok",
    version: "0.1.0",
    ingestProvider: process.env.INGEST_PROVIDER ?? "stub",
  }));

  await registerDashboardRoutes(app);
  await registerAdminRoutes(app);

  await app.listen({ port, host });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
