import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// Test runner env: same slug as an org in Supabase (see E2E_APPLY_ORG_SLUG in .env.example).
dotenv.config({ path: path.join(__dirname, ".env.local") });
dotenv.config({ path: path.join(__dirname, ".env.pilot-e2e.local") });
dotenv.config({ path: path.join(__dirname, ".env") });

const pilotBaseURL = (
  process.env.PILOT_BASE_URL ??
  process.env.SMOKE_BASE_URL ??
  "http://localhost:3000"
).replace(/\/$/, "");

/**
 * Base URL for the non-pilot projects. Defaults to 3000 exactly as before; the
 * override exists so specs can be run against an already-running dev server on
 * another port (Next refuses to start a second one, so a hardcoded 3000 makes
 * the suite unrunnable whenever a dev server is already up elsewhere).
 */
const e2eBaseURL = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

const localWorkersRaw = Number.parseInt(process.env.PLAYWRIGHT_WORKERS ?? "1", 10);
const localWorkers = Number.isFinite(localWorkersRaw) && localWorkersRaw > 0 ? localWorkersRaw : 1;

/** Required smoke paths — blocks dev→main promotion when green. */
const smokeTestMatch = [
  /launch-jun3-smoke\.spec\.ts/,
  /auth-flow\.spec\.ts/,
  /apply-flow\.spec\.ts/,
  /recruiter-flow\.spec\.ts/,
  /brief11-plan-smoke\.spec\.ts/,
];

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  timeout: process.env.CI ? 120_000 : 90_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : localWorkers,
  reporter: "html",
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: e2eBaseURL,
    navigationTimeout: 90_000,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "smoke",
      testMatch: smokeTestMatch,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "pilot",
      testMatch: /e2e\/pilot\/.*\.spec\.ts/,
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: pilotBaseURL,
      },
    },
    {
      name: "full",
      testIgnore: [...smokeTestMatch, /e2e\/pilot\/.*\.spec\.ts/],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: e2eBaseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
