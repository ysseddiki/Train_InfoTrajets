import type { FastifyRequest } from "fastify";

/**
 * Skeleton auth gate.
 * Replace with signed httpOnly session cookie before any real deployment.
 */
export function requireAdminSession(req: FastifyRequest): boolean {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return false;
  const token = header.slice("Bearer ".length).trim();
  return token === "dev-session-replace-me";
}
