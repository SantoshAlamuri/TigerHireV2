#!/usr/bin/env node
/**
 * Audit mutating API routes for auth + CSRF guards.
 *
 * This is a RATCHET, not a snapshot. `api-guard-baseline.json` records the
 * routes that are unguarded today; the gate fails on anything NEW, and also
 * fails when a baseline entry becomes stale (route guarded or deleted) so the
 * list can only ever shrink. Fix a route, drop its line, it can never return.
 *
 * Before this was a ratchet the tail was advisory: `missingAuth` printed a
 * non-blocking warning capped at 10 lines, and `missingCsrf` only failed for
 * ten hand-listed CRITICAL_PREFIXES. `src/app/api/admin/whatsapp-intake`
 * shipped a POST with no validateOrigin precisely because `admin/` was not on
 * that list — the gap was visible in the generated report for weeks and
 * nothing failed.
 *
 * Detection is by guard idiom, so it is only as good as AUTH_IDIOMS below. A
 * route using a guard that is not listed reads as unguarded — add the idiom
 * rather than baselining the route, or the baseline fills with false
 * positives and stops meaning anything.
 *
 * Usage:
 *   node scripts/audit-api-routes.mjs                  # gate (CI)
 *   node scripts/audit-api-routes.mjs --write-baseline # accept current state
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const API_ROOT = "src/app/api";
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(HERE, "api-guard-baseline.json");
const WRITE_BASELINE = process.argv.includes("--write-baseline");

/**
 * Every helper that actually establishes a caller's identity. Session guards,
 * platform/settings admin guards, and the signature/token guards that stand in
 * for a session on machine or emailed-link callers.
 */
const AUTH_IDIOMS = [
  "requireAuth(",
  "isAuthorized(",
  "verifyCron",
  "CRON_SECRET",
  "requireSettingsAdmin(",
  "requirePlatformAdmin(",
  "requireScimContext(",
  "requireTryoutAuth(",
  "verifyOfferPublicSession(",
  "verifyReferrerOtp(",
  "verifyWhatsAppSignature(",
  "requireToken(",
];

/** Paths that intentionally skip browser CSRF (webhooks, cron, public apply, etc.). */
const PUBLIC_MUTATION_ALLOWLIST = [
  /^src\/app\/api\/webhooks\//,
  /^src\/app\/api\/cron\//,
  /^src\/app\/api\/inngest\//,
  /^src\/app\/api\/apply\/route\.ts$/,
  /^src\/app\/api\/applications\/route\.ts$/, // candidate apply
  /^src\/app\/api\/intake\//,
  /^src\/app\/api\/scim\//,
  /^src\/app\/api\/waitlist\/route\.ts$/,
  /^src\/app\/api\/contact\/route\.ts$/,
  /^src\/app\/api\/signals\/ingest\/route\.ts$/,
  /^src\/app\/api\/offers\/public\//,
  /^src\/app\/api\/offers\/company-sign\//,
  /^src\/app\/api\/refer\/otp\//,
  /^src\/app\/api\/refer\/join\/route\.ts$/,
  /^src\/app\/api\/schedule\/self-serve\//,
  /^src\/app\/api\/auth\//,
  /^src\/app\/api\/approvals\/action\//,
  // Public marketing demo — unauthenticated by design, gated by OTP + rate limit.
  /^src\/app\/api\/public\/demo\//,
  // Pre-auth by definition: the caller is proving an emailed token, not a session.
  /^src\/app\/api\/invites\/\[token\]\/route\.ts$/,
  /^src\/app\/api\/assessments\/share\/\[token\]\//,
];

/** Critical domains — missing validateOrigin fails the audit. */
const CRITICAL_PREFIXES = [
  "src/app/api/jobs/",
  "src/app/api/applications/",
  "src/app/api/offers/",
  "src/app/api/fitscore/",
  "src/app/api/fit-score/",
  "src/app/api/pipeline/",
  "src/app/api/agency/pipeline/",
  "src/app/api/screening/trigger/",
  "src/app/api/screening/override/",
  "src/app/api/settings/screening/",
];

/** Dev-only routes — must not be reachable in production. */
const DEV_ONLY_ROUTE_PATTERNS = [
  /^src\/app\/api\/debug\//,
  /^src\/app\/api\/test-whatsapp\/route\.ts$/,
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (name === "route.ts") files.push(full);
  }
  return files;
}

function exportsMutatingMethods(source) {
  const methods = [];
  for (const m of MUTATING) {
    if (new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`).test(source)) methods.push(m);
  }
  return methods;
}

function isAllowlisted(path) {
  return PUBLIC_MUTATION_ALLOWLIST.some((re) => re.test(path));
}

function isCritical(path) {
  return CRITICAL_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * A route that 404s unless NODE_ENV === "development" is not a production
 * attack surface, so it needs neither a session guard nor CSRF. The dev-route
 * check below still verifies the guard is actually present.
 */
function hasDevOnlyGuard(source) {
  return (
    source.includes('NODE_ENV !== "development"') || source.includes("NODE_ENV !== 'development'")
  );
}

const routes = walk(API_ROOT);
const missingAuth = [];
const missingCsrf = [];
const criticalMissingCsrf = [];
const devRouteProductionRisk = [];

for (const file of routes) {
  const rel = relative(process.cwd(), file).replaceAll("\\", "/");
  const source = readFileSync(file, "utf8");

  for (const pattern of DEV_ONLY_ROUTE_PATTERNS) {
    if (!pattern.test(rel)) continue;
    const hasProdGuard =
      source.includes('NODE_ENV !== "development"') ||
      source.includes("NODE_ENV !== 'development'") ||
      source.includes('process.env.NODE_ENV !== "development"');
    if (!hasProdGuard) devRouteProductionRisk.push(rel);
  }

  const methods = exportsMutatingMethods(source);
  if (methods.length === 0) continue;

  const devOnly = hasDevOnlyGuard(source);
  const hasAuth =
    AUTH_IDIOMS.some((idiom) => source.includes(idiom)) || isAllowlisted(rel) || devOnly;

  // tryoutCsrfGuard() delegates to validateOrigin() after letting through the
  // known tryout demo origins, so it counts as CSRF coverage.
  const hasCsrf =
    source.includes("validateOrigin(") ||
    source.includes("tryoutCsrfGuard(") ||
    isAllowlisted(rel) ||
    devOnly;

  if (!hasAuth) missingAuth.push({ rel, methods });
  if (!hasCsrf) {
    missingCsrf.push({ rel, methods });
    if (isCritical(rel)) criticalMissingCsrf.push({ rel, methods });
  }
}

const reportLines = [
  "# API guard gaps (auto-generated)",
  "",
  `Scanned ${routes.length} route files.`,
  "",
  "## Critical routes missing validateOrigin",
  "",
];

if (criticalMissingCsrf.length === 0) {
  reportLines.push("_None — critical set is clean._");
} else {
  for (const row of criticalMissingCsrf) {
    reportLines.push(`- \`${row.rel}\` (${row.methods.join(", ")})`);
  }
}

reportLines.push("", "## Dev routes without production guard", "");
if (devRouteProductionRisk.length === 0) {
  reportLines.push("_None._");
} else {
  for (const rel of devRouteProductionRisk) {
    reportLines.push(`- \`${rel}\``);
  }
}

reportLines.push("", "## All mutating routes missing validateOrigin", "");
if (missingCsrf.length === 0) {
  reportLines.push("_None._");
} else {
  for (const row of missingCsrf.slice(0, 40)) {
    reportLines.push(`- \`${row.rel}\` (${row.methods.join(", ")})`);
  }
  if (missingCsrf.length > 40) {
    reportLines.push(`- … and ${missingCsrf.length - 40} more (see script output)`);
  }
}

writeFileSync("docs/security/API-GUARD-GAPS.md", `${reportLines.join("\n")}\n`, "utf8");

console.log(`API route audit: ${routes.length} files`);
console.log(`Missing requireAuth: ${missingAuth.length}`);
console.log(`Missing validateOrigin: ${missingCsrf.length}`);
console.log(`Critical missing CSRF: ${criticalMissingCsrf.length}`);
console.log("Report: docs/security/API-GUARD-GAPS.md");

if (devRouteProductionRisk.length > 0) {
  for (const rel of devRouteProductionRisk) {
    console.error(`DEV ROUTE PRODUCTION RISK: ${rel}`);
  }
  process.exit(1);
}

if (criticalMissingCsrf.length > 0) {
  for (const row of criticalMissingCsrf) {
    console.error(`CRITICAL CSRF GAP: ${row.rel}`);
  }
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Ratchet: the unguarded set may shrink, never grow.
// ---------------------------------------------------------------------------
const currentCsrf = missingCsrf.map((r) => r.rel).sort();
const currentAuth = missingAuth.map((r) => r.rel).sort();

if (WRITE_BASELINE) {
  writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify({ missingCsrf: currentCsrf, missingAuth: currentAuth }, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `Baseline written: ${currentCsrf.length} CSRF, ${currentAuth.length} auth. ` +
      "Every entry is a route to fix, not a route that is fine.",
  );
  process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
  console.error(`Missing ${BASELINE_PATH}. Run with --write-baseline to create it.`);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
const failures = [];

for (const [label, current, recorded] of [
  ["validateOrigin", currentCsrf, baseline.missingCsrf ?? []],
  ["auth guard", currentAuth, baseline.missingAuth ?? []],
]) {
  const recordedSet = new Set(recorded);
  const currentSet = new Set(current);

  for (const rel of current) {
    if (!recordedSet.has(rel)) {
      failures.push(`NEW ROUTE MISSING ${label}: ${rel}`);
    }
  }
  // A stale entry means the route was fixed or deleted. Force the baseline to
  // shrink with it, otherwise the list rots into a permanent exemption.
  for (const rel of recorded) {
    if (!currentSet.has(rel)) {
      failures.push(
        `STALE BASELINE (${label}) — now guarded or deleted, remove from api-guard-baseline.json: ${rel}`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("");
  for (const line of failures) console.error(line);
  console.error(
    "\nAdd the guard, or — if the route is genuinely public — add it to " +
      "PUBLIC_MUTATION_ALLOWLIST with a comment saying why.",
  );
  process.exit(1);
}

console.log(
  `Guard ratchet: ${currentCsrf.length} CSRF / ${currentAuth.length} auth baselined, none new.`,
);
