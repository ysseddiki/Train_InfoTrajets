import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Ce serveur est réservé au **développement**. En production, le client est un build
 * statique servi par nginx (`deploy/nginx/sncf-alerts.conf`) : aucun processus Vite ne
 * tourne, ce qui permet une CSP sans `script-src 'unsafe-inline'` et supprime HMR,
 * sourcemaps et middlewares de dev de la surface exposée.
 */
const port = Number(process.env.WEB_PORT ?? 443);
const host = process.env.WEB_HOST ?? "0.0.0.0";

/**
 * Vite bloque les `Host` inconnus (protection contre le rebinding DNS). On liste donc
 * explicitement les hôtes de dev plutôt que d'ouvrir à tous.
 */
function resolveAllowedHosts(): true | string[] {
  const raw = (process.env.WEB_ALLOWED_HOSTS ?? "").trim();
  if (raw === "*") return true;
  const extra = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ["localhost", "127.0.0.1", ...extra];
}

export default defineConfig({
  plugins: [react(), basicSsl()],
  build: {
    // Pas de sourcemap en production : le bundle ne doit pas exposer les sources.
    sourcemap: false,
  },
  server: {
    host,
    port,
    strictPort: true,
    allowedHosts: resolveAllowedHosts(),
    proxy: {
      "/v1": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});
