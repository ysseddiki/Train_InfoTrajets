import type { FastifyInstance } from "fastify";
import type {
  JourneyConfig,
  JourneyDirection,
  LiaisonUpsertBody,
  IngestConfigUpdate,
  RecipientsConfig,
} from "@sncf-alerts/shared";
import { injectStubEvent } from "../adapters/ingest.js";
import {
  clearSessionCookie,
  requireAdmin,
  sanitizeForLog,
  setSessionCookie,
} from "../domain/auth.js";
import { sendTestNotification } from "../domain/notify.js";
import {
  checkLoginRateLimit,
  resetLoginRateLimit,
} from "../domain/rate-limit.js";
import { store } from "../domain/store.js";

function isIngestProvider(
  value: unknown,
): value is IngestConfigUpdate["provider"] {
  return value === "stub" || value === "navitia" || value === "prim";
}

export async function registerAdminRoutes(app: FastifyInstance) {
  app.post<{
    Body: { username?: string; password?: string };
  }>("/v1/admin/login", async (req, reply) => {
    const ip = req.ip;
    const rate = checkLoginRateLimit(ip);
    if (!rate.allowed) {
      return reply.code(429).send({
        type: "/errors/rate-limit",
        title: "Too many login attempts",
        status: 429,
        retryAfterSec: rate.retryAfterSec,
      });
    }

    const username = req.body?.username ?? "";
    const password = req.body?.password ?? "";
    req.log.info({ loginAttempt: sanitizeForLog({ username }) }, "admin login");

    const admin = await store.verifyLogin(username, password);
    if (!admin) {
      return reply.code(401).send({
        type: "/errors/unauthorized",
        title: "Invalid credentials",
        status: 401,
      });
    }

    resetLoginRateLimit(ip);
    const session = await store.createSession(admin.id);
    setSessionCookie(reply, session.id, session.expiresAt);
    return { authenticated: true, username: admin.username };
  });

  app.post("/v1/admin/logout", async (req, reply) => {
    const sid = req.cookies?.[store.sessionCookieName];
    await store.deleteSession(sid);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/v1/admin/me", async (req, reply) => {
    const session = await requireAdmin(req, reply);
    if (!session) return;
    return { username: session.username, role: "admin" };
  });

  app.get("/v1/admin/liaisons", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    return store.listLiaisons();
  });

  app.post("/v1/admin/liaisons", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    return store.createLiaison();
  });

  app.get<{ Params: { id: string } }>(
    "/v1/admin/liaisons/:id",
    async (req, reply) => {
      if (!(await requireAdmin(req, reply))) return;
      const liaison = await store.getLiaison(req.params.id);
      if (!liaison) {
        return reply.code(404).send({
          type: "/errors/not-found",
          title: "Liaison not found",
          status: 404,
        });
      }
      return liaison;
    },
  );

  app.put<{ Params: { id: string }; Body: LiaisonUpsertBody }>(
    "/v1/admin/liaisons/:id",
    async (req, reply) => {
      if (!(await requireAdmin(req, reply))) return;
      try {
        return await store.upsertLiaison(req.params.id, req.body ?? {});
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

  app.delete<{ Params: { id: string } }>(
    "/v1/admin/liaisons/:id",
    async (req, reply) => {
      if (!(await requireAdmin(req, reply))) return;
      try {
        await store.deleteLiaison(req.params.id);
        return { ok: true };
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 500;
        return reply.code(status).send({
          type:
            status === 404
              ? "/errors/not-found"
              : status === 400
                ? "/errors/validation"
                : "/errors/server",
          title: err instanceof Error ? err.message : "Error",
          status,
        });
      }
    },
  );

  /** Compat: lit/écrit la première liaison. */
  app.get<{ Params: { direction: JourneyDirection } }>(
    "/v1/admin/journeys/:direction",
    async (req, reply) => {
      if (!(await requireAdmin(req, reply))) return;
      const journey = await store.getJourney(req.params.direction);
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
    if (!(await requireAdmin(req, reply))) return;
    return store.upsertJourney(req.params.direction, req.body ?? {});
  });

  app.get("/v1/admin/channels/smtp", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    return store.getSmtpPublic();
  });

  app.get("/v1/admin/channels/teams", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    return store.getTeamsPublic();
  });

  app.get("/v1/admin/ingest", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    return store.getIngestConfigPublic();
  });

  app.put<{ Body: IngestConfigUpdate }>(
    "/v1/admin/ingest",
    async (req, reply) => {
      if (!(await requireAdmin(req, reply))) return;
      const body = req.body ?? ({} as IngestConfigUpdate);
      if (!isIngestProvider(body.provider)) {
        return reply.code(400).send({
          type: "/errors/validation",
          title: "provider must be stub | navitia | prim",
          status: 400,
        });
      }
      return store.updateIngestConfig({
        provider: body.provider,
        token: body.token,
      });
    },
  );

  app.get("/v1/admin/channels/recipients", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    return store.getRecipients();
  });

  app.get("/v1/admin/quota", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    return store.getApiQuota("navitia");
  });

  app.post<{
    Body?: {
      eventSources?: Array<"stub" | "prim" | "navitia">;
      deliveries?: boolean;
    };
  }>("/v1/admin/stats/clear", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    try {
      return await store.clearStats({
        eventSources: req.body?.eventSources,
        deliveries: req.body?.deliveries,
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 500;
      return reply.code(status).send({
        type: status === 400 ? "/errors/validation" : "/errors/server",
        title: err instanceof Error ? err.message : "Error",
        status,
      });
    }
  });

  app.put<{ Body: RecipientsConfig }>(
    "/v1/admin/channels/recipients",
    async (req, reply) => {
      if (!(await requireAdmin(req, reply))) return;
      return store.setRecipients(req.body ?? { emails: [] });
    },
  );

  app.post<{ Params: { type: "email" | "teams" } }>(
    "/v1/admin/channels/:type/test",
    async (req, reply) => {
      if (!(await requireAdmin(req, reply))) return;
      const type = req.params.type;
      if (type !== "email" && type !== "teams") {
        return reply.code(400).send({
          type: "/errors/validation",
          title: "Invalid channel",
          status: 400,
        });
      }
      return sendTestNotification(type);
    },
  );

  app.post<{
    Body?: {
      direction?: JourneyDirection;
      journeyId?: string;
      liaisonId?: string;
      delayMinutes?: number;
      kind?: "delay" | "cancellation";
    };
  }>("/v1/admin/debug/stub-event", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    await injectStubEvent(req.body ?? {});
    return { ok: true };
  });
}
