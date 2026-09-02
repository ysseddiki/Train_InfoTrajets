/**
 * Proxies de confiance pour `trustProxy` (Fastify → proxy-addr).
 *
 * Sans cette configuration, `req.ip` vaut l'IP du reverse-proxy et tous les clients
 * partagent un même compteur de rate-limit. À l'inverse, faire confiance à n'importe
 * quelle source permettrait de forger `X-Forwarded-For` : l'allowlist est donc explicite.
 *
 * Valeurs acceptées : IP, CIDR, ou mots-clés `proxy-addr` (`loopback`, `linklocal`,
 * `uniquelocal`). `false` / `none` : aucune confiance, on utilise l'IP de la socket.
 */
export function parseTrustedProxies(
  raw: string | undefined,
): string | string[] | false {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return "loopback";
  if (trimmed.toLowerCase() === "false" || trimmed.toLowerCase() === "none") {
    return false;
  }
  const list = trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : false;
}
