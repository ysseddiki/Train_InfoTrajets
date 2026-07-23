import type { FastifyInstance } from "fastify";
import type {
  AlertDeliveryDto,
  DashboardOverview,
  DisruptionEventDto,
  JourneyConfig,
  JourneyDirection,
} from "@sncf-alerts/shared";
import { store } from "../domain/store.js";

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get("/v1/dashboard/overview", async (): Promise<DashboardOverview> => {
    return store.getOverview();
  });

  app.get("/v1/journeys", async (): Promise<JourneyConfig[]> => {
    return store.listJourneys();
  });

  app.get<{ Querystring: { direction?: string } }>(
    "/v1/events",
    async (req): Promise<DisruptionEventDto[]> => {
      const raw = req.query.direction;
      const direction =
        raw === "outbound" || raw === "inbound"
          ? (raw as JourneyDirection)
          : undefined;
      return store.listEvents(50, direction);
    },
  );

  app.get("/v1/deliveries", async (): Promise<AlertDeliveryDto[]> => {
    return store.listDeliveries();
  });
}
