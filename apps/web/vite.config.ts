import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: "0.0.0.0",
    port: 443,
    https: true,
    proxy: {
      "/v1": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});
