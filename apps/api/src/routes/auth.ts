import type { FastifyInstance } from "fastify";
import { store } from "../domain/store.js";

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get("/v1/auth/config", async () => {
    return { visitorEnabled: await store.getVisitorEnabled() };
  });
}
