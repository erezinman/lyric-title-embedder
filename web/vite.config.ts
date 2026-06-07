import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const DAEMON = process.env.KSS_DAEMON_URL || "http://127.0.0.1:8770";

export default defineConfig({
  plugins: [react()],
  // jassub's module worker uses a dynamic wasm import (code-splitting); the
  // default IIFE worker format rejects that. ES module workers handle it.
  worker: { format: "es" },
  server: {
    proxy: {
      "/api": { target: DAEMON, changeOrigin: true },
      "/mcp": { target: DAEMON, changeOrigin: true },
      "/ws": { target: DAEMON, ws: true, changeOrigin: true },
    },
  },
  test: {
    globals: true,
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    environment: "jsdom",
    setupFiles: ["./src/vitest.setup.ts"],
    // jsdom cannot run the jassub wasm worker — the live renderer is exercised by
    // the Playwright AJ tier (web/e2e/jassub.spec.ts). Keep the flag OFF here so
    // PreviewStage falls back to the DOM caption layer for component tests.
    env: { VITE_JASSUB: "0" },
  },
});
