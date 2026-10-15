#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const mode = process.argv[2] ?? "ga-sweep";

const bundles = {
  critical: {
    name: "critical",
    description:
      "Running critical verification: auth, intake, and compliance core routes (target under 15s).",
    tests: [
      "tests/unit/auth-login-2fa-route.test.ts",
      "tests/unit/email-intake-route.test.ts",
      "tests/unit/webhooks-whatsapp-route.test.ts",
      "tests/unit/compliance-dsr-route.test.ts",
      "tests/unit/compliance-retention-report-route.test.ts",
      "tests/unit/usage-summary-route.test.ts",
    ],
  },
  "ga-sweep": {
    name: "ga-sweep",
    description:
      "Running GA verification: 10 backend route suites + 2 component suites (target under 60s).",
    tests: [
      "tests/unit/email-intake-route.test.ts",
      "tests/unit/webhooks-whatsapp-route.test.ts",
      "tests/unit/pipeline-bulk-general-route.test.ts",
      "tests/unit/candidate-notes-route.test.ts",
      "tests/unit/whatsapp-flow-status-route.test.ts",
      "tests/unit/compliance-dsr-route.test.ts",
      "tests/unit/compliance-retention-report-route.test.ts",
      "tests/unit/usage-summary-route.test.ts",
      "tests/unit/auth-login-2fa-route.test.ts",
      "tests/unit/admin-users-bulk-invite-route.test.ts",
      "tests/component/dashboard-intelligence-focus.test.tsx",
      "tests/component/recruit-pipeline-card-reasoning.test.tsx",
    ],
  },
  stability: {
    name: "stability",
    description: "Regression imports + performance budgets (no network; target under 60s).",
    tests: ["tests/regression", "tests/performance"],
  },
};

const selected = bundles[mode];
if (!selected) {
  console.error(
    `Unknown verification bundle "${mode}". Use one of: ${Object.keys(bundles).join(", ")}`,
  );
  process.exit(2);
}

console.log(`\n==> ${selected.description}`);
const startedAt = Date.now();
const result = spawnSync("npx", ["vitest", "run", ...selected.tests], {
  stdio: "inherit",
});
const elapsedMs = Date.now() - startedAt;
const elapsedS = (elapsedMs / 1000).toFixed(2);

if (result.status !== 0) {
  console.error(`\n✖ ${selected.name.toUpperCase()} FAILED in ${elapsedS}s`);
  process.exit(result.status ?? 1);
}

console.log(`\n✔ ${selected.name.toUpperCase()} PASSED in ${elapsedS}s`);
