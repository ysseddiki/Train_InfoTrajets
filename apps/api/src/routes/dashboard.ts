import type { FastifyInstance } from "fastify";
import type {
  AlertDeliveryDto,
  DashboardOverview,
  DisruptionEventDto,
  JourneyConfig,
  JourneyDirection,
  LiaisonConfig,
} from "@sncf-alerts/shared";
import { store } from "../domain/store.js";
import { requireViewer } from "../domain/auth.js";

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { liaisonId?: string } }>(
    "/v1/dashboard/overview",
    async (req, reply): Promise<DashboardOverview | void> => {
      if (!(await requireViewer(req, reply))) return;
      try {
        return await store.getOverview(req.query.liaisonId);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 500;
        return reply.code(status).send({
          type: status === 404 ? "/errors/not-found" : "/errors/server",
          title: err instanceof Error ? err.message : "Error",
          status,
        });
      }
    },
  );

  app.get("/v1/liaisons", async (req, reply): Promise<LiaisonConfig[] | void> => {
    if (!(await requireViewer(req, reply))) return;
    return store.listLiaisons();
  });

  app.get("/v1/journeys", async (req, reply): Promise<JourneyConfig[] | void> => {
    if (!(await requireViewer(req, reply))) return;
    return store.listJourneys();
  });

  app.get<{ Querystring: { direction?: string; liaisonId?: string } }>(
    "/v1/events",
    async (req, reply): Promise<DisruptionEventDto[] | void> => {
      if (!(await requireViewer(req, reply))) return;
      const raw = req.query.direction;
      const direction =
        raw === "outbound" || raw === "inbound"
          ? (raw as JourneyDirection)
          : undefined;
      const liaisonId =
        req.query.liaisonId && req.query.liaisonId !== "all"
          ? req.query.liaisonId
          : undefined;
      return store.listEvents(50, { direction, liaisonId });
    },
  );

  app.get<{ Querystring: { liaisonId?: string } }>(
    "/v1/deliveries",
    async (req, reply): Promise<AlertDeliveryDto[] | void> => {
      if (!(await requireViewer(req, reply))) return;
      const liaisonId =
        req.query.liaisonId && req.query.liaisonId !== "all"
          ? req.query.liaisonId
          : undefined;
      return store.listDeliveries(50, { liaisonId });
    },
  );
}
