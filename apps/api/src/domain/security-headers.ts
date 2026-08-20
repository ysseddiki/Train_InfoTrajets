import type { FastifyReply } from "fastify";

/** Headers anti-cache / anti-framing sur toutes les réponses API. */
export function applySecurityHeaders(reply: FastifyReply): void {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Referrer-Policy", "no-referrer");
  reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  reply.header("Cross-Origin-Resource-Policy", "same-origin");
}

export function applyAdminNoStore(reply: FastifyReply): void {
  reply.header(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, private",
  );
  reply.header("Pragma", "no-cache");
  reply.header("Expires", "0");
  reply.header("X-Robots-Tag", "noindex, nofollow");
}
