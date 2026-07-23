import type { FastifyInstance } from "fastify";
import type {
  JourneyConfig,
  JourneyDirection,
  RecipientsConfig,
  SmtpConfigPublic,
  TeamsConfigPublic,
} from "@sncf-alerts/shared";
import { memoryStore } from "../domain/store.js";
import { requireAdminSession } from "../domain/auth.js";

export async function registerAdminRoutes(app: FastifyInstance) {
  app.post<{
    Body: { username?: string; password?: string };
  }>("/v1/admin/login", async (req, reply) => {
    const ok = memoryStore.tryLogin(
      req.body?.username ?? "",
      req.body?.password ?? "",
    );
    if (!ok) {
      return reply.code(401).send({
        type: "/errors/unauthorized",
        title: "Invalid credentials",
        status: 401,
      });
    }
    // Skeleton: opaque session placeholder (replace with httpOnly cookie)
    return { authenticated: true, token: "dev-session-replace-me" };
  });

  app.post("/v1/admin/logout", async () => ({ ok: true }));

  app.get("/v1/admin/me", async (req, reply) => {
    if (!requireAdminSession(req)) {
      return reply.code(401).send({
        type: "/errors/unauthorized",
        title: "Unauthorized",
        status: 401,
      });
    }
    return { username: process.env.ADMIN_USERNAME ?? "admin", role: "admin" };
  });

  app.get<{ Params: { direction: JourneyDirection } }>(
    "/v1/admin/journeys/:direction",
    async (req, reply) => {
      if (!requireAdminSession(req)) {
        return reply.code(401).send({
          type: "/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
        });
      }
      const journey = memoryStore.getJourney(req.params.direction);
      if (!journey) {
        return reply.code(404).send({
          type: "/errors/not-found",
          title: "Journey not found",
          status: 404,
        });
      }
      return journey;
    },
  );

  app.put<{
    Params: { direction: JourneyDirection };
    Body: Partial<JourneyConfig>;
  }>("/v1/admin/journeys/:direction", async (req, reply) => {
    if (!requireAdminSession(req)) {
      return reply.code(401).send({
        type: "/errors/unauthorized",
        title: "Unauthorized",
        status: 401,
      });
    }
    return memoryStore.upsertJourney(req.params.direction, req.body ?? {});
  });

  app.get("/v1/admin/channels/smtp", async (req, reply) => {
    if (!requireAdminSession(req)) {
      return reply.code(401).send({
        type: "/errors/unauthorized",
        title: "Unauthorized",
        status: 401,
      });
    }
    const smtp: SmtpConfigPublic = memoryStore.getSmtpPublic();
    return smtp;
  });

  app.get("/v1/admin/channels/teams", async (req, reply) => {
    if (!requireAdminSession(req)) {
      return reply.code(401).send({
        type: "/errors/unauthorized",
        title: "Unauthorized",
        status: 401,
      });
    }
    const teams: TeamsConfigPublic = memoryStore.getTeamsPublic();
    return teams;
  });

  app.get("/v1/admin/channels/recipients", async (req, reply) => {
    if (!requireAdminSession(req)) {
      return reply.code(401).send({
        type: "/errors/unauthorized",
        title: "Unauthorized",
        status: 401,
      });
    }
    const recipients: RecipientsConfig = memoryStore.getRecipients();
    return recipients;
  });

  app.put<{ Body: RecipientsConfig }>(
    "/v1/admin/channels/recipients",
    async (req, reply) => {
      if (!requireAdminSession(req)) {
        return reply.code(401).send({
          type: "/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
        });
      }
      return memoryStore.setRecipients(req.body ?? { emails: [] });
    },
  );

  app.post<{ Params: { type: "email" | "teams" } }>(
    "/v1/admin/channels/:type/test",
    async (req, reply) => {
      if (!requireAdminSession(req)) {
        return reply.code(401).send({
          type: "/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
        });
      }
      // Skeleton: real SMTP/Teams adapters come next
      return {
        channel: req.params.type,
        status: "queued",
        detail: "Test queued — notifier not wired yet",
      };
    },
  );
}
