import { defineConfig, devices } from "@playwright/test";

import { webOrigin } from "../../tests/support/origin.js";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: webOrigin,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `./node_modules/.bin/vite --host ${new URL(webOrigin).hostname} --port ${new URL(webOrigin).port || "80"} --strictPort`,
    url: `${webOrigin}/api/health`,
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
