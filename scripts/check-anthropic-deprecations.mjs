#!/usr/bin/env node
/**
 * Weekly Anthropic model deprecation check.
 *
 * Reads the current models from `src/lib/config/models.ts`, queries Anthropic's
 * Models API for each, and reports anything deprecated or retired. Designed to
 * run on GitHub Actions cron (`.github/workflows/anthropic-model-deprecation-check.yml`)
 * and open a GitHub issue when migration is needed.
 *
 * Exit codes:
 *   0 — all models OK
 *   1 — at least one model is deprecated (issue should be opened)
 *   2 — script error (network, missing key, etc.)
 *
 * Required env:
 *   ANTHROPIC_API_KEY — to query the Models API
 *   GH_TOKEN          — only when --create-issue is passed; for `gh issue create`
 *
 * Usage (local):  node scripts/check-anthropic-deprecations.mjs
 * Usage (CI):     node scripts/check-anthropic-deprecations.mjs --create-issue
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREATE_ISSUE = process.argv.includes("--create-issue");

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_KEY) {
  console.error("ERROR: ANTHROPIC_API_KEY env var is required.");
  process.exit(2);
}

/**
 * Extract model IDs from src/lib/config/models.ts.
 * Parses the `MODELS` const-assertion object literal — keeps this script
 * dependency-free (no TypeScript compile step needed in CI).
 */
function loadConfiguredModels() {
  const configPath = resolve(__dirname, "..", "src", "lib", "config", "models.ts");
  const source = readFileSync(configPath, "utf8");
  const match = source.match(/export const MODELS\s*=\s*\{([\s\S]*?)\}\s*as const/);
  if (!match) {
    console.error("ERROR: could not locate `MODELS` const in src/lib/config/models.ts");
    process.exit(2);
  }
  const block = match[1];
  const entries = [...block.matchAll(/(\w+)\s*:\s*"([^"]+)"/g)];
  if (entries.length === 0) {
    console.error("ERROR: no model entries found in MODELS object.");
    process.exit(2);
  }
  return entries.map(([, key, modelId]) => ({ key, modelId }));
}

async function fetchModelMetadata(modelId) {
  const url = `https://api.anthropic.com/v1/models/${encodeURIComponent(modelId)}`;
  const res = await fetch(url, {
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
  });
  if (res.status === 404) return { found: false, status: 404 };
  if (!res.ok) {
    return { found: false, status: res.status, error: await res.text() };
  }
  return { found: true, status: 200, body: await res.json() };
}

function classifyModel(modelId, meta) {
  if (!meta.found) {
    if (meta.status === 404) {
      return {
        severity: "RETIRED",
        message: `Model \`${modelId}\` returned 404 from /v1/models — it has been retired and API calls will fail.`,
      };
    }
    return {
      severity: "ERROR",
      message: `Model \`${modelId}\` lookup failed (HTTP ${meta.status}): ${meta.error || "unknown"}`,
    };
  }
  // Anthropic's response shape may evolve; check common deprecation indicators.
  const body = meta.body;
  const deprecatedAt = body.deprecated_at || body.deprecation_date || null;
  const retiredAt = body.retired_at || body.retirement_date || null;
  if (retiredAt) {
    return {
      severity: "RETIRED",
      message: `Model \`${modelId}\` is retired (retired_at=${retiredAt}).`,
    };
  }
  if (deprecatedAt) {
    return {
      severity: "DEPRECATED",
      message: `Model \`${modelId}\` is deprecated (deprecated_at=${deprecatedAt}). Plan migration before retirement.`,
    };
  }
  return { severity: "OK", message: `Model \`${modelId}\` is active.` };
}

function buildIssueBody(findings) {
  const lines = [
    "Weekly Anthropic model deprecation check found models that need attention.",
    "",
    "## Findings",
    "",
  ];
  for (const f of findings) {
    lines.push(
      `- **${f.severity}** \`${f.modelId}\` (used as \`MODELS.${f.key}\`) — ${f.message.replace(/^Model `[^`]+` /, "")}`,
    );
  }
  lines.push(
    "",
    "## How to migrate",
    "",
    "1. Open `src/lib/config/models.ts`.",
    "2. Replace the offending model ID with the recommended replacement from the [Anthropic migration guide](https://platform.claude.com/docs/en/about-claude/models/migration-guide).",
    "3. Open a PR off `dev` branch per the project's branch rules (`CLAUDE.md`).",
    "4. The single-file change here means every Anthropic call site is automatically updated.",
    "",
    "## Why this issue exists",
    "",
    "This issue was opened automatically by `.github/workflows/anthropic-model-deprecation-check.yml`, which runs every Monday at 09:00 UTC. The script lives at `scripts/check-anthropic-deprecations.mjs`.",
  );
  return lines.join("\n");
}

function createGithubIssue(title, body) {
  const result = spawnSync(
    "gh",
    ["issue", "create", "--title", title, "--body", body, "--label", "tech-debt,automated"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.status !== 0) {
    console.error(`ERROR: gh issue create failed (exit ${result.status}):`);
    console.error(result.stderr || result.stdout);
    return false;
  }
  console.log(`Issue created: ${(result.stdout || "").trim()}`);
  return true;
}

async function main() {
  const configured = loadConfiguredModels();
  console.log(`Checking ${configured.length} model(s) configured in src/lib/config/models.ts:`);

  const findings = [];
  for (const { key, modelId } of configured) {
    const meta = await fetchModelMetadata(modelId);
    const result = classifyModel(modelId, meta);
    console.log(`  [${result.severity}] MODELS.${key} → ${modelId}`);
    if (result.severity !== "OK") {
      findings.push({ key, modelId, ...result });
    }
  }

  if (findings.length === 0) {
    console.log("\nAll configured models are active. No action needed.");
    process.exit(0);
  }

  const title = `[automated] ${findings.length} Anthropic model(s) deprecated or retired`;
  const body = buildIssueBody(findings);

  console.log(`\nFOUND ${findings.length} ISSUE(S):`);
  for (const f of findings) {
    console.log(`  - ${f.severity}: ${f.modelId} (MODELS.${f.key})`);
  }

  if (CREATE_ISSUE) {
    console.log("\nOpening GitHub issue...");
    const ok = createGithubIssue(title, body);
    process.exit(ok ? 1 : 2);
  } else {
    console.log("\n(Pass --create-issue to open a GitHub issue automatically.)");
    console.log("\n--- Issue title ---");
    console.log(title);
    console.log("\n--- Issue body ---");
    console.log(body);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(2);
});
