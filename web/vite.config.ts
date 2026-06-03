import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const DAEMON = "http://127.0.0.1:8770";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: DAEMON, changeOrigin: true },
      "/mcp": { target: DAEMON, changeOrigin: true },
      "/ws": { target: DAEMON, ws: true, changeOrigin: true },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/vitest.setup.ts"],
  },
});
