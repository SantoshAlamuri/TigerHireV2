import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import { execFileSync } from "node:child_process";
dotenv.config({ path: ".env.local", quiet: true });
// Mandatory even for direct invocation: these tests write owned preview fixtures.
execFileSync(process.execPath, ["scripts/assert-ci-preview.mjs"], { stdio: "inherit" });
if (!process.env.SEED_DEMO_PASSWORD)
  throw new Error("Release tests require seeded preview accounts");
const port = Number(process.env.RELEASE_TEST_PORT ?? "3021");
export default defineConfig({
  testDir: "./e2e/release",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  forbidOnly: true,
  reporter: [["list"], ["json", { outputFile: "test-results/release.json" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${port}`,
    trace: "off",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1366, height: 768 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `node node_modules/next/dist/bin/next start --hostname localhost --port ${port}`,
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      OUTBOUND_NOTIFICATIONS_ENABLED: "false",
      EMAIL_MODE: "sandbox",
      WHATSAPP_MODE: "sandbox",
      VERCEL_ENV: "preview",
      CRON_SECRET: "release-test-local-only",
    },
  },
});
