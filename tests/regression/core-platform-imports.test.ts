import { describe, it, expect } from "vitest";

/**
 * Regression: critical modules and route handlers must import without throwing.
 * Avoids heavy graphs (e.g. Inngest registry, FitScore three-stage) that instantiate SDKs at load time.
 */
const regressionModules: ReadonlyArray<readonly [string, () => Promise<unknown>]> = [
  ["redis keys", () => import("@/lib/redis/keys")],
  ["fitscore types", () => import("@/lib/fitscore/types")],
  ["validations: contact", () => import("@/lib/validations/contact")],
  ["validations: waitlist", () => import("@/lib/validations/waitlist")],
  ["validations: auth login", () => import("@/lib/validations/auth")],
  ["GET /api/openapi", () => import("@/app/api/openapi/route")],
  ["GET /api/health/csrf", () => import("@/app/api/health/csrf/route")],
  ["lib/api-helpers (Zod helpers)", () => import("@/lib/api-helpers")],
  ["lib/config/env", () => import("@/lib/config/env")],
];

describe("regression: core platform imports", () => {
  it.each(regressionModules)("loads %s", async (_label, load) => {
    const mod = await load();
    expect(mod).toBeTruthy();
  });
});
