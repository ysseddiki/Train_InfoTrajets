import type { FastifyReply, FastifyRequest } from "fastify";
import { store } from "./store.js";

export type AdminSession = { adminId: string; username: string };

declare module "fastify" {
  interface FastifyRequest {
    adminSession?: AdminSession | null;
  }
}

export async function loadAdminSession(
  req: FastifyRequest,
): Promise<AdminSession | null> {
  const sid = req.cookies?.[store.sessionCookieName];
  const session = await store.getSession(sid);
  req.adminSession = session;
  return session;
}

export async function requireAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<AdminSession | null> {
  const session = await loadAdminSession(req);
  if (!session) {
    await reply.code(401).send({
      type: "/errors/unauthorized",
      title: "Unauthorized",
      status: 401,
    });
    return null;
  }
  return session;
}

export function setSessionCookie(
  reply: FastifyReply,
  sessionId: string,
  expiresAt: Date,
): void {
  const secure =
    process.env.COOKIE_SECURE === "true" ||
    process.env.NODE_ENV === "production";
  reply.setCookie(store.sessionCookieName, sessionId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(store.sessionCookieName, { path: "/" });
}

/** Never log password / Authorization / webhook values */
export function sanitizeForLog(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const clone: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const key of Object.keys(clone)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("password") ||
      lower.includes("authorization") ||
      lower.includes("webhook") ||
      lower.includes("token") ||
      lower.includes("secret") ||
      lower.includes("api_key")
    ) {
      clone[key] = "[redacted]";
    }
  }
  return clone;
}
