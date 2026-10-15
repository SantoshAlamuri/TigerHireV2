#!/usr/bin/env node
/**
 * Security safety preflight: API guards + tenant unit smokes + ga-sweep.
 * Usage: npm run security:safety-check
 */
import { spawnSync } from "node:child_process";

const steps = [
  ["API route guard audit", ["node", ["scripts/audit-api-routes.mjs"]]],
  [
    "Tenant access unit tests",
    [
      "npx",
      [
        "vitest",
        "run",
        "tests/unit/job-access-tenant.test.ts",
        "tests/unit/applications-id-tenant.test.ts",
        "tests/unit/screening-trigger-route.test.ts",
        "tests/unit/fit-score-tenant-access.test.ts",
      ],
    ],
  ],
  ["Release verification (ga-sweep)", ["npm", ["run", "test:release-gate"]]],
];

for (const [label, [cmd, args]] of steps) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    console.error(`\n✖ ${label} failed`);
    process.exit(result.status ?? 1);
  }
}

console.log("\n✓ Security safety check passed");
