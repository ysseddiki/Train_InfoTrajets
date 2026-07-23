import type { FastifyInstance } from "fastify";
import type {
  JourneyConfig,
  JourneyDirection,
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

  app.get("/v1/admin/channels/recipients", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    return store.getRecipients();
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

  /** Debug: inject stub disruption (admin only) */
  app.post<{
    Body?: {
      direction?: JourneyDirection;
      delayMinutes?: number;
      kind?: "delay" | "cancellation";
    };
  }>("/v1/admin/debug/stub-event", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    await injectStubEvent(req.body ?? {});
    return { ok: true };
  });
}
