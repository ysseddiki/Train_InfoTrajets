import type { FastifyInstance } from "fastify";
import type {
  AccessSettings,
  JourneyConfig,
  JourneyDirection,
  LiaisonUpsertBody,
  IngestConfigUpdate,
  IngestProbeRequest,
  IngestProviderId,
  RecipientsConfig,
  SmtpConfigUpdate,
  StationUpsertBody,
  AdminPasswordUpdate,
  UserCreateBody,
  UserPatchBody,
} from "@sncf-alerts/shared";
import { ROLES_ANY, ROLES_LIAISON } from "@sncf-alerts/shared";
import { probeIngestCredential } from "../adapters/ingest-probe.js";
import { injectStubEvent, seedStubHistory } from "../adapters/ingest.js";
import {
  clearSessionCookie,
  requireAdmin,
  requireRole,
  sanitizeForLog,
  setSessionCookie,
} from "../domain/auth.js";
import {
  clearIngestApiLogs,
  isIngestApiLogSource,
  listIngestApiLogs,
} from "../domain/ingest-api-logs.js";
import { sendTestNotification } from "../domain/notify.js";
import {
  checkLoginRateLimit,
  resetLoginRateLimit,
} from "../domain/rate-limit.js";
import { store } from "../domain/store.js";

function isIngestProvider(value: unknown): value is IngestProviderId {
  return value === "stub" || value === "navitia";
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
    return { authenticated: true, username: admin.username, role: admin.role };
  });

  app.post("/v1/admin/logout", async (req, reply) => {
    const sid = req.cookies?.[store.sessionCookieName];
    await store.deleteSession(sid);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/v1/admin/me", async (req, reply) => {
    const session = await requireRole(req, reply, ROLES_ANY);
    if (!session) return;
    return { username: session.username, role: session.role };
  });

  app.put<{ Body: AdminPasswordUpdate }>(
    "/v1/admin/account/password",
    async (req, reply) => {
      const session = await requireRole(req, reply, ROLES_ANY);
      if (!session) return;
      try {
        await store.changeAdminPassword(
          session.adminId,
          req.body?.currentPassword ?? "",
          req.body?.newPassword ?? "",
        );
        return { ok: true };
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 500;
        return reply.code(status).send({
          type: "/errors/password",
          title:
            status === 401
              ? "Mot de passe actuel incorrect"
              : status === 400
                ? "Mot de passe invalide"
                : "Erreur",
          status,
          detail: err instanceof Error ? err.message : "Erreur",
        });
      }
    },
  );

  app.get("/v1/admin/liaisons", async (req, reply) => {
    if (!(await requireRole(req, reply, ROLES_LIAISON))) return;
    return store.listLiaisons();
  });

  app.post("/v1/admin/liaisons", async (req, reply) => {
    if (!(await requireRole(req, reply, ROLES_LIAISON))) return;
    return store.createLiaison();
  });

  app.get<{ Params: { id: string } }>(
    "/v1/admin/liaisons/:id",
    async (req, reply) => {
      if (!(await requireRole(req, reply, ROLES_LIAISON))) return;
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
      if (!(await requireRole(req, reply, ROLES_LIAISON))) return;
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
      if (!(await requireRole(req, reply, ROLES_LIAISON))) return;
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

  app.put<{ Params: { id: string } }>(
    "/v1/admin/liaisons/:id/default",
    async (req, reply) => {
      if (!(await requireRole(req, reply, ROLES_LIAISON))) return;
      try {
        return await store.setDefaultLiaison(req.params.id);
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

  app.get("/v1/admin/stations", async (req, reply) => {
    if (!(await requireRole(req, reply, ROLES_LIAISON))) return;
    return store.listStations();
  });

  app.post<{ Body: StationUpsertBody }>(
    "/v1/admin/stations",
    async (req, reply) => {
      if (!(await requireRole(req, reply, ROLES_LIAISON))) return;
      try {
        return await store.createStation(req.body ?? { externalId: "", label: "" });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 500;
        return reply.code(status).send({
          type:
            status === 409
              ? "/errors/conflict"
              : status === 400
                ? "/errors/validation"
                : "/errors/server",
          title: err instanceof Error ? err.message : "Error",
          status,
        });
      }
    },
  );

  app.put<{ Params: { id: string }; Body: StationUpsertBody }>(
    "/v1/admin/stations/:id",
    async (req, reply) => {
      if (!(await requireAdmin(req, reply))) return;
      try {
        return await store.updateStation(
          req.params.id,
          req.body ?? { externalId: "", label: "" },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 500;
        return reply.code(status).send({
          type:
            status === 404
              ? "/errors/not-found"
              : status === 409
                ? "/errors/conflict"
                : status === 400
                  ? "/errors/validation"
                  : "/errors/server",
          title: err instanceof Error ? err.message : "Error",
          status,
        });
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/v1/admin/stations/:id",
    async (req, reply) => {
      if (!(await requireAdmin(req, reply))) return;
      try {
        await store.deleteStation(req.params.id);
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
      if (!(await requireRole(req, reply, ROLES_LIAISON))) return;
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
    if (!(await requireRole(req, reply, ROLES_LIAISON))) return;
    return store.upsertJourney(req.params.direction, req.body ?? {});
  });

  app.get("/v1/admin/channels/smtp", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    return store.getSmtpPublic();
  });

  app.put<{ Body: SmtpConfigUpdate }>(
    "/v1/admin/channels/smtp",
    async (req, reply) => {
      if (!(await requireAdmin(req, reply))) return;
      const body = req.body ?? {};
      if (body.port !== undefined) {
        const p = Number(body.port);
        if (!Number.isFinite(p) || p < 1 || p > 65535) {
          return reply.code(400).send({
            type: "/errors/validation",
            title: "port must be 1–65535",
            status: 400,
          });
        }
      }
      return store.updateSmtpConfig(body);
    },
  );

  app.get("/v1/admin/channels/teams", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    return store.getTeamsPublic();
  });

  app.get("/v1/admin/ingest", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    return store.getIngestConfigPublic();
  });

  app.post<{ Body: IngestProbeRequest }>(
    "/v1/admin/ingest/probe",
    async (req, reply) => {
      if (!(await requireAdmin(req, reply))) return;
      const provider = req.body?.provider;
      if (!isIngestProvider(provider)) {
        return reply.code(400).send({
          type: "/errors/validation",
          title: "provider must be stub | navitia",
          status: 400,
        });
      }
      const override = req.body?.token?.trim() || null;
      const secret =
        override ||
        (provider === "stub" ? null : await store.getIngestSecret(provider));
      const result = await probeIngestCredential(provider, secret);
      await store.saveIngestCheck(result);
      return result;
    },
  );

  app.put<{ Body: IngestConfigUpdate }>(
    "/v1/admin/ingest",
    async (req, reply) => {
      if (!(await requireAdmin(req, reply))) return;
      const body = req.body ?? {};
      if (
        body.activeProvider !== undefined &&
        !isIngestProvider(body.activeProvider)
      ) {
        return reply.code(400).send({
          type: "/errors/validation",
          title: "activeProvider must be stub | navitia",
          status: 400,
        });
      }

      const navitiaToken = body.navitiaToken?.trim() || undefined;

      if (navitiaToken) {
        const probe = await probeIngestCredential("navitia", navitiaToken);
        await store.saveIngestCheck(probe);
      }

      if (body.activeProvider === "navitia") {
        const tokenForActive =
          navitiaToken || (await store.getIngestSecret("navitia"));
        const probe = await probeIngestCredential("navitia", tokenForActive);
        await store.saveIngestCheck(probe);
      }

      if (body.activeProvider === "stub") {
        const probe = await probeIngestCredential("stub", null);
        await store.saveIngestCheck(probe);
      }

      return store.updateIngestConfig({
        activeProvider: body.activeProvider,
        navitiaToken,
        stubPollIntervalSeconds: body.stubPollIntervalSeconds,
        navitiaPollIntervalSeconds: body.navitiaPollIntervalSeconds,
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
      eventSources?: Array<"stub" | "prim" | "navitia" | "zou">;
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

  app.post<{
    Body?: {
      months?: number;
      liaisonId?: string;
    };
  }>("/v1/admin/debug/stub-history", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const result = await seedStubHistory(req.body ?? {});
    return { ok: true, ...result };
  });

  app.get<{
    Querystring: { limit?: string; trainNumber?: string; status?: string };
  }>("/v1/admin/debug/train-observations", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const raw = Number(req.query?.limit ?? 100);
    const limit = Number.isFinite(raw) ? raw : 100;
    const statusRaw = req.query?.status?.trim() || null;
    const allowed = ["on_time", "delayed", "cancelled", "unknown"] as const;
    if (
      statusRaw &&
      !allowed.includes(statusRaw as (typeof allowed)[number])
    ) {
      return reply.code(400).send({
        type: "/errors/validation",
        title: "status must be on_time | delayed | cancelled | unknown",
        status: 400,
      });
    }
    const entries = await store.listRecentTrainObservations({
      limit,
      trainNumber: req.query?.trainNumber ?? null,
      status: statusRaw as
        | "on_time"
        | "delayed"
        | "cancelled"
        | "unknown"
        | null,
    });
    return { entries };
  });

  app.get<{
    Querystring: { source?: string };
  }>("/v1/admin/debug/ingest-logs", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const raw = req.query?.source;
    if (raw && raw !== "all" && !isIngestApiLogSource(raw)) {
      return reply.code(400).send({
        type: "/errors/validation",
        title: "source must be navitia | stub | all",
        status: 400,
      });
    }
    const source =
      raw && isIngestApiLogSource(raw) ? raw : null;
    return {
      source: source ?? "all",
      entries: listIngestApiLogs(source),
    };
  });

  app.delete<{
    Querystring: { source?: string };
  }>("/v1/admin/debug/ingest-logs", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const raw = req.query?.source;
    if (raw && raw !== "all" && !isIngestApiLogSource(raw)) {
      return reply.code(400).send({
        type: "/errors/validation",
        title: "source must be navitia | stub | all",
        status: 400,
      });
    }
    const source =
      raw && isIngestApiLogSource(raw) ? raw : null;
    const deleted = clearIngestApiLogs(source);
    return { ok: true, deleted };
  });

  app.get("/v1/admin/users", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    return store.listUsers();
  });

  app.post<{ Body: UserCreateBody }>(
    "/v1/admin/users",
    async (req, reply) => {
      if (!(await requireAdmin(req, reply))) return;
      try {
        return await store.createUser(req.body ?? ({} as UserCreateBody));
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 500;
        return reply.code(status).send({
          type:
            status === 409
              ? "/errors/conflict"
              : status === 400
                ? "/errors/validation"
                : "/errors/server",
          title: err instanceof Error ? err.message : "Error",
          status,
        });
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: UserPatchBody }>(
    "/v1/admin/users/:id",
    async (req, reply) => {
      if (!(await requireAdmin(req, reply))) return;
      try {
        return await store.patchUser(req.params.id, req.body ?? {});
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

  app.get("/v1/admin/settings/access", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    return { visitorEnabled: await store.getVisitorEnabled() };
  });

  app.put<{ Body: AccessSettings }>(
    "/v1/admin/settings/access",
    async (req, reply) => {
      if (!(await requireAdmin(req, reply))) return;
      const enabled = req.body?.visitorEnabled;
      if (typeof enabled !== "boolean") {
        return reply.code(400).send({
          type: "/errors/validation",
          title: "visitorEnabled must be a boolean",
          status: 400,
        });
      }
      return {
        visitorEnabled: await store.setVisitorEnabled(enabled),
      };
    },
  );
}
