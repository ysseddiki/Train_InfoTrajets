import type { FastifyInstance } from "fastify";
import type {
  AlertDeliveryDto,
  DashboardOverview,
  DisruptionEventDto,
  JourneyConfig,
} from "@sncf-alerts/shared";
import { memoryStore } from "../domain/store.js";

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get("/v1/dashboard/overview", async (): Promise<DashboardOverview> => {
    return memoryStore.getOverview();
  });

  app.get("/v1/journeys", async (): Promise<JourneyConfig[]> => {
    return memoryStore.listJourneys();
  });

  app.get("/v1/events", async (): Promise<DisruptionEventDto[]> => {
    return memoryStore.listEvents();
  });

  app.get("/v1/deliveries", async (): Promise<AlertDeliveryDto[]> => {
    return memoryStore.listDeliveries();
  });
}
