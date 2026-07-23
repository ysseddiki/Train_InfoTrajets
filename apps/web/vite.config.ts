import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 443,
    proxy: {
      "/v1": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});
