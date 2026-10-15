#!/usr/bin/env node
/**
 * Enterprise launch readiness: security, regression, dependency audit, auto checks.
 * Usage: npm run launch:enterprise-ready
 *        SKIP_E2E=1 npm run launch:enterprise-ready
 */
import { spawnSync } from "node:child_process";

const steps = [
  ["Security safety check", ["npm", ["run", "security:safety-check"]]],
  ["Stability regression (unit)", ["npm", ["run", "test:stability"]]],
  ["Launch readiness auto", ["npm", ["run", "launch:readiness:auto"]]],
  ["Dependency security audit", ["npm", ["run", "security-audit"]]],
];

if (process.env.SKIP_E2E !== "1") {
  steps.push(["Playwright smoke", ["npm", ["run", "test:e2e:smoke"]]]);
}

for (const [label, [cmd, args]] of steps) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    console.error(`\n✖ ${label} failed`);
    process.exit(result.status ?? 1);
  }
}

console.log("\n✓ Enterprise launch readiness passed");
