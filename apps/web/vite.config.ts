import fs from "node:fs";
import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig, type ServerOptions } from "vite";

/**
 * TLS :
 * - WEB_TLS_CERT + WEB_TLS_KEY → certificat Let's Encrypt (ou autre)
 * - WEB_BEHIND_PROXY=true → HTTP local (nginx termine le TLS)
 * - sinon → HTTPS auto-signé (dev, plugin basicSsl)
 */
function resolveHttps(): ServerOptions["https"] | false {
  if (process.env.WEB_BEHIND_PROXY === "true") {
    return false;
  }

  const certPath = process.env.WEB_TLS_CERT?.trim();
  const keyPath = process.env.WEB_TLS_KEY?.trim();
  if (certPath && keyPath) {
    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
      throw new Error(
        `WEB_TLS_CERT / WEB_TLS_KEY introuvables (${certPath}, ${keyPath})`,
      );
    }
    return {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    };
  }

  return true;
}

const https = resolveHttps();
const behindProxy = process.env.WEB_BEHIND_PROXY === "true";
const port = Number(
  process.env.WEB_PORT ?? (behindProxy ? 5173 : https ? 443 : 5173),
);
const host = process.env.WEB_HOST ?? (behindProxy ? "127.0.0.1" : "0.0.0.0");

export default defineConfig({
  plugins: [react(), ...(https === true ? [basicSsl()] : [])],
  server: {
    host,
    port,
    strictPort: true,
    https: https || undefined,
    proxy: {
      "/v1": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});
