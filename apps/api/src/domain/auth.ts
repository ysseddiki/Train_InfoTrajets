import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@sncf-alerts/shared";
import { ROLES_ADMIN } from "@sncf-alerts/shared";
import { canAccessDashboard, roleIsAllowed } from "./access.js";
import { store } from "./store.js";

export type AuthSession = {
  adminId: string;
  username: string;
  role: UserRole;
};

declare module "fastify" {
  interface FastifyRequest {
    adminSession?: AuthSession | null;
  }
}

const UNAUTHORIZED = {
  type: "/errors/unauthorized",
  title: "Unauthorized",
  status: 401,
} as const;

const FORBIDDEN = {
  type: "/errors/forbidden",
  title: "Forbidden",
  status: 403,
} as const;

export async function loadAdminSession(
  req: FastifyRequest,
): Promise<AuthSession | null> {
  const sid = req.cookies?.[store.sessionCookieName];
  const session = await store.getSession(sid);
  req.adminSession = session;
  return session;
}

export async function requireViewer(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  const session = await loadAdminSession(req);
  const visitorEnabled = await store.getVisitorEnabled();
  if (
    !canAccessDashboard({
      hasSession: Boolean(session),
      visitorEnabled,
    })
  ) {
    await reply.code(401).send(UNAUTHORIZED);
    return false;
  }
  return true;
}

export async function requireRole(
  req: FastifyRequest,
  reply: FastifyReply,
  allowed: readonly UserRole[],
): Promise<AuthSession | null> {
  const session = await loadAdminSession(req);
  if (!session) {
    await reply.code(401).send(UNAUTHORIZED);
    return null;
  }
  if (!roleIsAllowed(session.role, allowed)) {
    await reply.code(403).send(FORBIDDEN);
    return null;
  }
  return session;
}

export async function requireAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthSession | null> {
  return requireRole(req, reply, ROLES_ADMIN);
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
  const clone: Record<string, unknown> = {
    ...(value as Record<string, unknown>),
  };
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
