#!/usr/bin/env node
/**
 * Schema-vs-code drift gate.
 *
 * Every PostgREST `.select()` in src/ names columns on a table. When a named
 * column does not exist, PostgREST rejects the *whole* select — and almost
 * every call site here destructures `const { data } = await ...` without
 * checking `error`, so the caller sees null and carries on. The result is a 200
 * with data quietly missing, which is the hardest kind of failure to notice and
 * has cost this codebase months at a time:
 *
 *   - `candidates.role_title` (exists nowhere) made /api/my-pipeline fall back
 *     to a legacy select with no `phone`, so every pipeline card read
 *     "Phone not available" for as long as that column had been named.
 *   - `signals.status` drift silently killed the talent-scout cron.
 *   - an RLS migration that failed on a bad enum left a cross-tenant leak open
 *     for three months.
 *
 * This check probes the live schema the same way the app does
 * (`?select=<cols>&limit=0`), so it tests the real contract rather than a
 * reconstruction of it.
 *
 * It is a RATCHET, not a big bang: `schema-drift-baseline.json` records the
 * drift that already exists, and the gate fails only on drift that is new.
 * Fix a baseline entry, delete its line, and it can never come back.
 *
 * Usage:
 *   node scripts/schema-drift-check.mjs            # gate (CI)
 *   node scripts/schema-drift-check.mjs --report   # list everything, exit 0
 *   node scripts/schema-drift-check.mjs --write-baseline
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Without
 * them it exits 0 with a warning rather than failing — a missing secret should
 * not read as a clean bill of health, so the warning says so explicitly.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const BASELINE = join(HERE, "schema-drift-baseline.json");
const MODE = process.argv.includes("--write-baseline")
  ? "write"
  : process.argv.includes("--report")
    ? "report"
    : "gate";

// ---------------------------------------------------------------- extraction

function sourceFiles(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === ".git") continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) sourceFiles(p, acc);
    else if ([".ts", ".tsx"].includes(extname(p))) acc.push(p);
  }
  return acc;
}

/** Split on commas that are not inside parentheses. */
function splitTopLevel(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

const INTERP = /[${}`]/;

export function extractPairs(root) {
  const pairs = new Map(); // "table.column" -> Set<site>

  function record(table, column, site) {
    if (!table || !column) return;
    if (column.includes("*") || column.includes("::") || column.includes(" ")) return;
    if (/^count$/i.test(column)) return;
    if (INTERP.test(column) || INTERP.test(table)) return;
    // PostgREST can embed by FK column name (`direct_referrer_id(...)`), which
    // resolves through the relationship rather than naming a table.
    if (/_id$/.test(table)) return;
    const key = `${table}.${column}`;
    if (!pairs.has(key)) pairs.set(key, new Set());
    pairs.get(key).add(site);
  }

  function parseSelect(table, sel, site) {
    for (let tok of splitTopLevel(sel)) {
      if (tok.includes(":") && !tok.includes("(")) tok = tok.split(":").pop().trim();
      const paren = tok.indexOf("(");
      if (paren !== -1) {
        let name = tok.slice(0, paren).trim().split("!")[0].trim();
        if (name.includes(":")) name = name.split(":").pop().trim();
        parseSelect(name, tok.slice(paren + 1, tok.lastIndexOf(")")), site);
      } else record(table, tok, site);
    }
  }

  for (const f of sourceFiles(root)) {
    const src = readFileSync(f, "utf8");
    const fromRe = /\.from\(\s*["'`]([a-z0-9_]+)["'`]\s*\)/gi;
    let m;
    while ((m = fromRe.exec(src)) !== null) {
      const after = src.slice(m.index, m.index + 4000);
      const sm = /\.select\(\s*(["'`])([\s\S]*?)\1/.exec(after);
      if (!sm || sm.index > 900) continue;

      // The select must belong to THIS chain. `.from("x").update({...})` has no
      // select of its own; without this guard it steals the columns of the next
      // query in the file and attributes them to the wrong table. An earlier
      // version without it reported 128 phantom columns, most imaginary.
      const gap = after.slice(m[0].length, sm.index);
      if (/[;}]/.test(gap)) continue;
      if (/\.(insert|update|upsert|delete|rpc)\s*\(/.test(gap)) continue;
      if (/\.from\s*\(/.test(gap)) continue;

      const line = src.slice(0, m.index).split("\n").length;
      const rel = f.startsWith(REPO) ? f.slice(REPO.length + 1) : f;
      parseSelect(m[1], sm[2].replace(/\s+/g, " "), `${rel}:${line}`);
    }
  }
  return pairs;
}

// ------------------------------------------------------------------- probing

async function probeAll(pairs, url, key) {
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const byTable = new Map();
  for (const k of pairs.keys()) {
    const [table, ...rest] = k.split(".");
    if (!byTable.has(table)) byTable.set(table, []);
    byTable.get(table).push(rest.join("."));
  }

  async function probe(table, cols) {
    const q = `${url}/rest/v1/${encodeURIComponent(table)}?select=${encodeURIComponent(cols.join(","))}&limit=0`;
    const res = await fetch(q, { headers });
    if (res.ok) return { ok: true };
    let body = {};
    try {
      body = await res.json();
    } catch {
      /* non-json error body */
    }
    return { ok: false, message: body.message ?? `HTTP ${res.status}` };
  }

  const findings = [];
  for (const [table, cols] of byTable) {
    const first = await probe(table, cols);
    if (first.ok) continue;
    if (/Could not find the table/i.test(first.message)) {
      findings.push({ kind: "table", ref: table, message: first.message });
      continue;
    }
    for (const c of cols) {
      const one = await probe(table, [c]);
      if (!one.ok) findings.push({ kind: "column", ref: `${table}.${c}`, message: one.message });
    }
  }
  return findings.sort((a, b) => a.ref.localeCompare(b.ref));
}

// ---------------------------------------------------------------------- main

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.warn(
    "schema-drift-check: SKIPPED — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.\n" +
      "  This is NOT a pass. Nothing was verified against a real schema.",
  );
  process.exit(0);
}

// Which database answered matters: a finding can mean "the code is wrong" or
// "this environment is behind". Both look identical in the output otherwise, and
// reading a Sydney-only result as if it covered production is exactly the
// mistake this line exists to prevent — four cascade tables absent from preview
// are present on prod, and calling them missing "on both" inverted the
// conclusion about whether the LLM spend cap works.
const projectRef = url.match(/https?:\/\/([a-z0-9]+)\./)?.[1] ?? "unknown";
console.log(`schema-drift-check: probing project ${projectRef}`);

const pairs = extractPairs(join(REPO, "src"));
const findings = await probeAll(pairs, url.replace(/\/$/, ""), key);

// A view without `security_invoker` executes with its OWNER's privileges and so
// bypasses RLS on everything it reads. That is not theoretical: application_funnel
// shipped without it, has no organisation filter in its body, and the data agent's
// job_funnel tool queries it without one — so any authenticated user could read
// every organisation's job titles, application volumes and conversion rates. The
// agent is explicitly designed to delegate tenancy to RLS, which made a view that
// opted out of RLS invisible as a risk. Assert the condition instead.
let leakyViews = [];
try {
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/views_without_security_invoker`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: "{}",
  });
  // A non-OK response must NOT leave leakyViews as [] — an empty array reads as
  // "no leaky views", which would make a missing helper look like a clean pass.
  leakyViews = res.ok ? ((await res.json()) ?? []) : null;
} catch {
  leakyViews = null;
}
if (leakyViews === null) {
  console.warn(
    "schema-drift-check: view security_invoker assertion SKIPPED — " +
      "views_without_security_invoker() unavailable. This is NOT a pass.",
  );
} else if (leakyViews.length > 0) {
  console.error(
    `schema-drift-check: ${leakyViews.length} view(s) without security_invoker — these bypass RLS:\n` +
      leakyViews.map((v) => `    ${v.view_name ?? v}`).join("\n"),
  );
  process.exit(1);
}

if (MODE === "write") {
  writeFileSync(BASELINE, `${JSON.stringify(findings.map((f) => f.ref).sort(), null, 2)}\n`);
  console.log(
    `schema-drift-check: baseline written with ${findings.length} known entries from project ${projectRef}.`,
  );
  console.log("  NOTE: a baseline is only valid for the database it was generated against.");
  process.exit(0);
}

const baseline = existsSync(BASELINE)
  ? new Set(JSON.parse(readFileSync(BASELINE, "utf8")))
  : new Set();
const fresh = findings.filter((f) => !baseline.has(f.ref));
const fixed = [...baseline].filter((b) => !findings.some((f) => f.ref === b));

if (MODE === "report") {
  console.log(`schema-drift-check: ${pairs.size} (table, column) pairs checked.`);
  for (const f of findings) console.log(`  ${f.kind === "table" ? "TABLE " : ""}${f.ref}`);
  process.exit(0);
}

if (fixed.length > 0) {
  console.log(
    `schema-drift-check: ${fixed.length} baseline entr${fixed.length === 1 ? "y is" : "ies are"} now clean — ` +
      `remove from scripts/schema-drift-baseline.json so they cannot regress:\n` +
      fixed.map((f) => `    ${f}`).join("\n"),
  );
}

if (fresh.length === 0) {
  console.log(
    `schema-drift-check: no new drift on ${projectRef} (${pairs.size} pairs checked, ${baseline.size} known in baseline).`,
  );
  process.exit(0);
}

console.error(
  `schema-drift-check: ${fresh.length} NEW schema/code mismatch(es).\n` +
    `These selects name something the database does not have. PostgREST rejects the\n` +
    `whole select, and a caller that ignores \`error\` sees null and carries on — a 200\n` +
    `with data silently missing.\n`,
);
for (const f of fresh) {
  console.error(`  ${f.kind === "table" ? "TABLE " : ""}${f.ref}`);
  console.error(`      ${f.message}`);
  for (const site of [...(pairs.get(f.ref) ?? [])].slice(0, 3)) console.error(`      at ${site}`);
}
console.error(
  `\nFix the select or ship the migration. If it is intentional and temporary,\n` +
    `add it to scripts/schema-drift-baseline.json with a reason in the PR.`,
);
process.exit(1);
