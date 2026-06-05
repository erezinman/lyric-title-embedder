import { defineConfig } from "@playwright/test";

// E2E tier: real daemon (temp projects dir, seeded "audit" project) + real vite
// + chromium. Single worker — every spec shares the daemon's one open project,
// and helpers.resetProject() re-opens it from disk between tests.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  workers: 1,
  retries: 0,
  timeout: 20_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5199",
    screenshot: "only-on-failure",
  },
});
