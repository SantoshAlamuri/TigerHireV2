/**
 * Elite Standard v2.0 — Zod at API boundaries.
 * Fails if any mutating API route (POST/PUT/PATCH/DELETE) does not use Zod (z. or .parse/safeParse).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const allowlistPath = path.join(__dirname, "validate-schemas-allowlist.txt");

function loadAllowlist() {
  if (!fs.existsSync(allowlistPath)) return new Set();
  return new Set(
    fs
      .readFileSync(allowlistPath, "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#")),
  );
}

function getApiRouteFiles() {
  const apiDir = path.join(root, "src", "app", "api");
  if (!fs.existsSync(apiDir)) return [];
  const list = [];
  function walk(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === "route.ts") list.push(path.relative(root, full));
    }
  }
  walk(apiDir);
  return list;
}

const MUTATING_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
const ZOD_INDICATORS = [
  /\bz\.\w+/,
  /\bzod\s*\./,
  /\.parse\s*\(/,
  /\.safeParse\s*\(/,
  /from\s+["']zod["']/,
];

function isMutatingRoute(content) {
  return MUTATING_METHODS.some((m) =>
    new RegExp(`export\\s+(const|async\\s+function|function)\\s+${m}\\b`).test(content),
  );
}

function usesZod(content) {
  return ZOD_INDICATORS.some((re) => re.test(content));
}

function main() {
  const allowed = loadAllowlist();
  const routes = getApiRouteFiles();
  const missing = [];
  for (const rel of routes) {
    if (allowed.has(rel)) continue;
    const content = fs.readFileSync(path.join(root, rel), "utf-8");
    if (isMutatingRoute(content) && !usesZod(content)) {
      missing.push(rel);
    }
  }
  if (missing.length > 0) {
    console.error("Elite Standard v2.0: Mutating API routes must use Zod for request validation.");
    console.error("Routes without Zod (.parse/safeParse or z. schema):");
    missing.forEach((f) => console.error("  -", f));
    process.exit(1);
  }
  if (allowed.size > 0) {
    console.log(
      `validate-schemas: All mutating API routes use Zod (${allowed.size} allowlisted legacy route(s) pending migration).`,
    );
  } else {
    console.log("validate-schemas: All mutating API routes use Zod.");
  }
}

main();
