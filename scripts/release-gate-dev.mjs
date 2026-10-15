#!/usr/bin/env node
/**
 * Dev promotion release gate: typecheck, lint-staged checks, ga-sweep, optional E2E smoke.
 * Usage: npm run release-gate:dev
 *        SKIP_E2E=1 npm run release-gate:dev
 */
import { spawnSync } from "node:child_process";

function run(label, command, args = []) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`\n✖ ${label} failed`);
    process.exit(result.status ?? 1);
  }
}

run("Gate release (typecheck, lint, validate, size, inngest, API audit)", "npm", [
  "run",
  "gate:release",
]);
run("Tenant + security regression", "npx", [
  "vitest",
  "run",
  "tests/unit/job-access-tenant.test.ts",
  "tests/unit/applications-id-tenant.test.ts",
  "tests/unit/screening-trigger-route.test.ts",
  "tests/unit/fit-score-tenant-access.test.ts",
]);
run("Release verification bundle (ga-sweep)", "npm", ["run", "test:release-gate"]);

if (process.env.SKIP_E2E !== "1") {
  run("Production build", "npm", ["run", "build"]);
  run("Production boot", "npm", ["run", "verify:boot"]);
  run("Required release journeys", "npm", ["run", "test:e2e:release"]);
} else {
  console.log("\nStatic checks passed. Release NOT verified: E2E/build skipped (SKIP_E2E=1).");
  process.exit(0);
}

console.log("\n✓ Dev release gate passed");
