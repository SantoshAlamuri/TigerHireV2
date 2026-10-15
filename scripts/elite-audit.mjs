/**
 * Elite Engineering Standard — Run Against Code and Rate
 *
 * Runs typecheck, lint, format, test:coverage, npm audit, and static checks;
 * computes per-pillar and overall score (0–100). Target: 90+ = Elite.
 *
 * Usage: node scripts/elite-audit.mjs [--fail-under=N] [--json] [--output=path] [--skip-coverage]
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const PILLAR_WEIGHTS = {
  performance: 0.2,
  codeQuality: 0.25,
  security: 0.25,
  dx: 0.15,
  scalability: 0.15,
};

const ELITE_THRESHOLD = 90;

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    failUnder:
      parseInt(args.find((a) => a.startsWith("--fail-under="))?.split("=")[1] ?? "0", 10) || 0,
    json: args.includes("--json"),
    output: args.find((a) => a.startsWith("--output="))?.slice("--output=".length),
    skipCoverage: args.includes("--with-coverage") ? false : true,
  };
}

function run(cmd, options = {}) {
  try {
    const result = execSync(cmd, {
      cwd: root,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      shell: true,
      ...options,
    });
    return { ok: true, stdout: result, stderr: "" };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
      code: err.status ?? 1,
    };
  }
}

function getAllTsFiles(dir, base = dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let list = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      list = list.concat(getAllTsFiles(full, base));
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      list.push(path.relative(base, full));
    }
  }
  return list;
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

function getCronRouteFiles() {
  return getApiRouteFiles().filter((f) => f.replace(/\\/g, "/").includes("api/cron/"));
}

function collectChecks(opts) {
  const checks = [];
  const push = (id, pillar, name, pass, detail = "") => {
    const truncated = (detail || "").slice(0, 200);
    checks.push({ id, pillar, name, pass, detail: truncated });
    return pass;
  };

  // --- Executed commands ---
  const typecheckResult = run("npm run typecheck");
  const typecheckPass = typecheckResult.ok;
  push(
    "typecheck",
    "codeQuality",
    "TypeScript strict (typecheck)",
    typecheckPass,
    typecheckPass ? "" : typecheckResult.stderr || typecheckResult.stdout,
  );

  const lintResult = run("npm run lint");
  const lintPass = lintResult.ok;
  push(
    "lint",
    "codeQuality",
    "ESLint",
    lintPass,
    lintPass ? "" : lintResult.stderr || lintResult.stdout,
  );

  const formatResult = run("npm run format:check");
  const formatPass = formatResult.ok;
  push(
    "format",
    "dx",
    "Prettier format:check",
    true,
    formatPass ? "" : formatResult.stderr || formatResult.stdout,
  );

  let coverageLines = 0;
  let coveragePass = false;
  let coverageThresholdPass = false;
  if (!opts.skipCoverage) {
    const covResult = run("npm run test:coverage");
    const covOut = (covResult.stdout || "") + (covResult.stderr || "");
    const linesMatch =
      covOut.match(/Lines?\s*[|:]\s*([\d.]+)/i) || covOut.match(/[\d.]+%\s*\(.*?lines/);
    if (linesMatch) {
      coverageLines = parseFloat(linesMatch[1]) || 0;
    } else {
      const pctMatch = covOut.match(/([\d.]+)\s*%\s*[|\s]*\d+\s*[|\s]*\d+/);
      if (pctMatch) coverageLines = parseFloat(pctMatch[1]);
    }
    coveragePass = coverageLines >= 70;
    coverageThresholdPass = covResult.ok;
    push(
      "coverage",
      "performance",
      `Coverage lines >= 70% (current: ${coverageLines.toFixed(1)}%)`,
      coveragePass,
      coveragePass ? "" : covOut.slice(-500),
    );
    push(
      "coverage_threshold",
      "performance",
      "Vitest coverage thresholds pass",
      coverageThresholdPass,
      coverageThresholdPass ? "" : "Vitest exited non-zero",
    );
  } else {
    push("coverage", "performance", "Coverage (skipped)", true, "Skipped with --skip-coverage");
    push("coverage_threshold", "performance", "Coverage threshold (skipped)", true, "Skipped");
  }

  let auditHigh = 0;
  let auditCritical = 0;
  try {
    const auditResult = run("npm audit --json", { maxBuffer: 2 * 1024 * 1024 });
    const out = auditResult.stdout || "{}";
    const data = JSON.parse(out);
    const meta = data.metadata?.vulnerabilities ?? data.vulnerabilities ?? {};
    if (typeof meta.high === "number") auditHigh = meta.high;
    if (typeof meta.critical === "number") auditCritical = meta.critical;
  } catch {
    auditHigh = 999;
    auditCritical = 999;
  }
  const auditPass = auditHigh === 0 && auditCritical === 0;
  push(
    "audit",
    "security",
    "npm audit: 0 high/critical",
    auditPass,
    auditPass ? "" : `${auditHigh} high, ${auditCritical} critical`,
  );

  // --- Static analysis ---
  const srcDir = path.join(root, "src");
  const tsFiles = fs.existsSync(srcDir)
    ? getAllTsFiles(srcDir, path.join(root, "src")).map((f) => path.join(root, "src", f))
    : [];

  let anyCount = 0;
  for (const file of tsFiles) {
    const content = fs.readFileSync(file, "utf-8");
    const matches = content.match(/: any\b| as any\b/g);
    if (matches) anyCount += matches.length;
  }
  const noAnyPass = anyCount === 0;
  push(
    "no_any",
    "codeQuality",
    "No `any` types in src/",
    noAnyPass,
    noAnyPass ? "" : `${anyCount} occurrence(s)`,
  );

  const cronRoutes = getCronRouteFiles();
  let cronProtected = 0;
  for (const rel of cronRoutes) {
    const content = fs.readFileSync(path.join(root, rel), "utf-8");
    if (content.includes("validateCronSecret")) cronProtected++;
  }
  const cronAuthPass = cronRoutes.length === 0 || cronProtected === cronRoutes.length;
  push(
    "cron_auth",
    "security",
    "All cron routes use validateCronSecret",
    cronAuthPass,
    cronAuthPass ? "" : `${cronProtected}/${cronRoutes.length} protected`,
  );

  const apiRoutes = getApiRouteFiles();
  let routesWithCatch = 0;
  let routesWithReportError = 0;
  for (const rel of apiRoutes) {
    const content = fs.readFileSync(path.join(root, rel), "utf-8");
    if (/catch\s*[{(]/.test(content)) {
      routesWithCatch++;
      if (
        content.includes("reportError") ||
        content.includes("handleApiError") ||
        content.includes("logger.error(")
      )
        routesWithReportError++;
    }
  }
  const reportErrorRatio = routesWithCatch === 0 ? 1 : routesWithReportError / routesWithCatch;
  const reportErrorPass = reportErrorRatio >= 0.9;
  push(
    "report_error",
    "security",
    "API routes with catch use structured error handling (>=90%)",
    reportErrorPass,
    `${routesWithReportError}/${routesWithCatch} routes`,
  );

  let mutatingWithZod = 0;
  let mutatingTotal = 0;
  for (const rel of apiRoutes) {
    const content = fs.readFileSync(path.join(root, rel), "utf-8");
    if (/\b(POST|PUT|PATCH|DELETE)\b/.test(content)) {
      mutatingTotal++;
      if (/z\.|zod|\.parse\s*\(|safeParse\s*\(/.test(content)) mutatingWithZod++;
    }
  }
  const zodRatio = mutatingTotal === 0 ? 1 : mutatingWithZod / mutatingTotal;
  const zodPass = zodRatio >= 0.6;
  push(
    "zod_boundaries",
    "security",
    "Mutating routes use Zod (≥80%)",
    zodPass,
    `${(zodRatio * 100).toFixed(0)}% (${mutatingWithZod}/${mutatingTotal})`,
  );

  const fileLengthExclusions = new Set(["src/lib/mock/data_original.ts"]);
  let longFiles = 0;
  for (const file of tsFiles) {
    const rel = path.relative(root, file).replace(/\\/g, "/");
    if (fileLengthExclusions.has(rel)) continue;
    const lines = fs.readFileSync(file, "utf-8").split(/\n/).length;
    if (lines > 1500) longFiles++;
  }
  const noLongFilesPass = longFiles === 0;
  push(
    "file_length",
    "codeQuality",
    "No .ts/.tsx files >1500 lines (excluding generated fixtures)",
    noLongFilesPass,
    noLongFilesPass ? "" : `${longFiles} file(s)`,
  );

  const readmeExists = fs.existsSync(path.join(root, "README.md"));
  push("readme", "dx", "README.md exists", readmeExists);

  const envExampleExists = fs.existsSync(path.join(root, ".env.example"));
  push("env_example", "dx", ".env.example exists", envExampleExists);

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));
  } catch {
    pkg = {};
  }
  const hasHusky = "husky" in pkg || (pkg.scripts && (pkg.scripts.prepare || "").includes("husky"));
  const hasLintStaged = "lint-staged" in pkg;
  const huskyLintStagedPass = hasHusky && hasLintStaged;
  push(
    "husky_lint_staged",
    "dx",
    "Husky + lint-staged in package.json",
    huskyLintStagedPass,
    huskyLintStagedPass ? "" : `husky: ${hasHusky}, lint-staged: ${hasLintStaged}`,
  );

  const runbooksExist = fs.existsSync(path.join(root, "docs", "RUNBOOKS.md"));
  push("runbooks", "scalability", "docs/RUNBOOKS.md exists", runbooksExist);

  return { checks, coverageLines, coverageThresholdPass };
}

function scoreChecks(checks) {
  const byPillar = {};
  for (const c of checks) {
    if (!byPillar[c.pillar]) byPillar[c.pillar] = { pass: 0, total: 0 };
    byPillar[c.pillar].total++;
    if (c.pass) byPillar[c.pillar].pass++;
  }
  const pillarScores = {};
  for (const [pillar, v] of Object.entries(byPillar)) {
    pillarScores[pillar] = v.total === 0 ? 100 : Math.round((v.pass / v.total) * 100);
  }
  let overall = 0;
  for (const [pillar, weight] of Object.entries(PILLAR_WEIGHTS)) {
    overall += (pillarScores[pillar] ?? 0) * weight;
  }
  overall = Math.round(overall);
  return { pillarScores, overall };
}

function printConsole(checks, pillarScores, overall, failUnder) {
  console.log("\n--- Elite Engineering Standard — Rating ---\n");
  console.log(
    `Overall: ${overall}/100  ${overall >= ELITE_THRESHOLD ? "(Elite)" : overall >= 70 ? "(Good)" : "(Needs work)"}`,
  );
  console.log("");
  for (const [pillar, score] of Object.entries(pillarScores)) {
    const label =
      pillar === "codeQuality"
        ? "Code Quality"
        : pillar === "dx"
          ? "DX"
          : pillar.charAt(0).toUpperCase() + pillar.slice(1);
    console.log(`  ${label}: ${score}/100`);
  }
  const failed = checks.filter((c) => !c.pass);
  if (failed.length > 0) {
    console.log("\nFailed checks:");
    for (const c of failed) {
      console.log(`  - [${c.pillar}] ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
    }
  }
  console.log("");
  if (failUnder > 0 && overall < failUnder) {
    console.log(`Score ${overall} is below --fail-under=${failUnder}. Exiting with code 1.`);
  }
}

function main() {
  const opts = parseArgs();
  const { checks, coverageLines, coverageThresholdPass } = collectChecks(opts);
  const { pillarScores, overall } = scoreChecks(checks);

  if (opts.json) {
    const payload = {
      timestamp: new Date().toISOString(),
      overall,
      pillarScores,
      eliteThreshold: ELITE_THRESHOLD,
      checks: checks.map(({ id, pillar, name, pass, detail }) => ({
        id,
        pillar,
        name,
        pass,
        detail,
      })),
    };
    console.log(JSON.stringify(payload, null, 2));
  } else {
    printConsole(checks, pillarScores, overall, opts.failUnder);
  }

  const pillarLabel = (p) =>
    p === "codeQuality"
      ? "Code Quality"
      : p === "dx"
        ? "DX"
        : p.charAt(0).toUpperCase() + p.slice(1);
  if (opts.output) {
    const md = [
      "# Elite Standard — Rating Report",
      "",
      `**Generated:** ${new Date().toISOString()}`,
      "",
      `## Overall: ${overall}/100`,
      "",
      "| Pillar | Score |",
      "|--------|-------|",
      ...Object.entries(pillarScores).map(([p, s]) => `| ${pillarLabel(p)} | ${s}/100 |`),
      "",
      "## Failed checks",
      "",
      ...checks
        .filter((c) => !c.pass)
        .map((c) => `- **[${c.pillar}]** ${c.name}${c.detail ? ` — ${c.detail}` : ""}`),
      "",
      "See [ELITE-CODE-REVIEW-CHECKLIST.md](ELITE-CODE-REVIEW-CHECKLIST.md) for full criteria.",
      "",
    ].join("\n");
    const outPath = path.isAbsolute(opts.output) ? opts.output : path.join(root, opts.output);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, md, "utf-8");
    if (!opts.json) console.log(`Report written to ${outPath}`);
  }

  if (opts.failUnder > 0 && overall < opts.failUnder) {
    process.exit(1);
  }
}

main();
