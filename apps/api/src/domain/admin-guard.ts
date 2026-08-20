import type { FastifyInstance } from "fastify";
import { loadAdminSession } from "./auth.js";
import { applyAdminNoStore, applySecurityHeaders } from "./security-headers.js";

const PUBLIC_ADMIN_PATHS = new Set(["/v1/admin/login", "/v1/admin/logout"]);

function requestPath(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

/**
 * Filet : toute route `/v1/admin/*` hors login/logout exige une session.
 * Les handlers gardent ensuite le contrôle des rôles.
 */
export async function registerAdminGuard(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (req, reply) => {
    applySecurityHeaders(reply);
    const path = requestPath(req.url);
    if (path.startsWith("/v1/admin")) {
      applyAdminNoStore(reply);
    }
  });

  app.addHook("preHandler", async (req, reply) => {
    const path = requestPath(req.url);
    if (!path.startsWith("/v1/admin")) return;
    if (req.method === "POST" && PUBLIC_ADMIN_PATHS.has(path)) return;

    const session = await loadAdminSession(req);
    if (!session) {
      return reply.code(401).send({
        type: "/errors/unauthorized",
        title: "Unauthorized",
        status: 401,
      });
    }
  });
}
