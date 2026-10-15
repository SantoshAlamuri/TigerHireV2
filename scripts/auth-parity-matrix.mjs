#!/usr/bin/env node
/**
 * Auth parity matrix for mutating API routes.
 *
 * Scans API route handlers under src/app/api and reports:
 * - mutating handlers with missing requireAuth/hasRole (for routes using getAuthContext)
 * - bulk route role drift versus non-bulk sibling mutating routes in the same domain
 *
 * Usage:
 *   node scripts/auth-parity-matrix.mjs
 *   node scripts/auth-parity-matrix.mjs --json
 *   node scripts/auth-parity-matrix.mjs --fail-on-findings
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const apiRoot = path.join(root, "src", "app", "api");
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const REQUIRE_AUTH_EXEMPT_ROUTES = new Set(["/api/invites/[token]"]);

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    json: args.includes("--json"),
    failOnFindings: args.includes("--fail-on-findings"),
  };
}

function walkRoutes(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkRoutes(full));
    } else if (entry.name === "route.ts") {
      out.push(full);
    }
  }
  return out;
}

function parseConstRoleArrays(content) {
  const arrays = new Map();
  const re = /const\s+([A-Za-z0-9_]+)\s*=\s*\[([\s\S]*?)\]\s+as const/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const name = m[1];
    const values = [];
    const roleRe = /"([a-z_]+)"/g;
    let roleMatch;
    while ((roleMatch = roleRe.exec(m[2])) !== null) {
      values.push(roleMatch[1]);
    }
    arrays.set(name, [...new Set(values)]);
  }
  return arrays;
}

function methodBlocks(content) {
  const blocks = [];
  const re = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g;
  const matches = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    matches.push({ method: m[1], idx: m.index });
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].idx;
    const end = i + 1 < matches.length ? matches[i + 1].idx : content.length;
    blocks.push({
      method: matches[i].method,
      body: content.slice(start, end),
    });
  }
  return blocks;
}

function extractRoleChecks(methodBody, constArrays) {
  const checks = [];
  const callRe = /hasRole\s*\(\s*ctx\s*,([\s\S]*?)\)/g;
  let m;
  while ((m = callRe.exec(methodBody)) !== null) {
    const argBlob = m[1];
    const directRoles = [];
    const directRoleRe = /"([a-z_]+)"/g;
    let roleMatch;
    while ((roleMatch = directRoleRe.exec(argBlob)) !== null) {
      directRoles.push(roleMatch[1]);
    }
    const spreadRoles = [];
    const spreadRe = /\.\.\.([A-Za-z0-9_]+)/g;
    let spreadMatch;
    while ((spreadMatch = spreadRe.exec(argBlob)) !== null) {
      const spreadName = spreadMatch[1];
      const fromConst = constArrays.get(spreadName) ?? [];
      spreadRoles.push(...fromConst);
    }
    const roles = [...new Set([...directRoles, ...spreadRoles])].sort();
    checks.push({
      raw: argBlob.replace(/\s+/g, " ").trim(),
      roles,
    });
  }
  return checks;
}

function routeIdFromPath(absPath) {
  return (
    "/api/" +
    path
      .relative(apiRoot, path.dirname(absPath))
      .replace(/\\/g, "/")
      .replace(/(^\/|\/$)/g, "")
  );
}

function analyzeRoute(absPath) {
  const content = fs.readFileSync(absPath, "utf-8");
  const usesAuthContext = content.includes("getAuthContext");
  const constArrays = parseConstRoleArrays(content);
  const methods = methodBlocks(content).map((methodBlock) => {
    const roleChecks = extractRoleChecks(methodBlock.body, constArrays);
    const roleUnion = [...new Set(roleChecks.flatMap((c) => c.roles))].sort();
    return {
      method: methodBlock.method,
      mutating: MUTATING_METHODS.has(methodBlock.method),
      hasRequireAuth: methodBlock.body.includes("requireAuth("),
      hasRoleCheck: roleChecks.length > 0,
      roleChecks,
      roleUnion,
    };
  });

  return {
    file: path.relative(root, absPath).replace(/\\/g, "/"),
    route: routeIdFromPath(absPath),
    routeDir: path.dirname(absPath).replace(/\\/g, "/"),
    usesAuthContext,
    methods,
  };
}

function findFindings(routes) {
  const findings = [];
  const advisories = [];

  for (const route of routes) {
    for (const method of route.methods) {
      if (!method.mutating) continue;
      if (!route.usesAuthContext) continue;

      if (!method.hasRequireAuth) {
        if (!REQUIRE_AUTH_EXEMPT_ROUTES.has(route.route)) {
          findings.push({
            severity: "high",
            type: "missing_require_auth",
            route: route.route,
            method: method.method,
            detail: "Mutating handler uses getAuthContext but does not enforce requireAuth.",
          });
        }
      }

      if (!method.hasRoleCheck) {
        advisories.push({
          severity: "medium",
          type: "missing_role_guard",
          route: route.route,
          method: method.method,
          detail:
            "No hasRole guard detected. May be valid for self-service ownership routes; verify manually.",
        });
      }
    }
  }

  const byRouteDir = new Map(routes.map((r) => [r.routeDir, r]));
  for (const route of routes) {
    if (!route.route.endsWith("/bulk")) continue;
    if (!route.usesAuthContext) continue;

    const bulkRoles = [
      ...new Set(route.methods.filter((m) => m.mutating).flatMap((m) => m.roleUnion)),
    ];
    if (bulkRoles.length === 0) continue;

    const parentDir = path.dirname(route.routeDir);
    const siblingRoles = new Set();
    for (const [dir, sibling] of byRouteDir.entries()) {
      if (dir === route.routeDir) continue;
      if (!dir.startsWith(parentDir)) continue;
      if (!sibling.usesAuthContext) continue;
      for (const m of sibling.methods) {
        if (!m.mutating) continue;
        for (const role of m.roleUnion) siblingRoles.add(role);
      }
    }

    if (siblingRoles.size === 0) continue;

    const extra = bulkRoles.filter((r) => !siblingRoles.has(r));
    if (extra.length > 0) {
      findings.push({
        severity: "medium",
        type: "bulk_role_drift",
        route: route.route,
        method: "MUTATING",
        detail: `Bulk roles not seen in sibling mutating routes: ${extra.join(", ")}`,
      });
    }
  }

  return { findings, advisories };
}

function printHuman(routes, findings, advisories) {
  const matrixRows = [];
  for (const route of routes) {
    for (const m of route.methods) {
      if (!m.mutating) continue;
      matrixRows.push({
        method: m.method,
        route: route.route,
        auth: route.usesAuthContext ? (m.hasRequireAuth ? "yes" : "NO") : "n/a",
        role: route.usesAuthContext ? (m.hasRoleCheck ? "yes" : "NO") : "n/a",
        roles: m.roleUnion.join(", "),
      });
    }
  }

  console.log("\n== Auth Parity Matrix (mutating API handlers) ==\n");
  for (const row of matrixRows.sort((a, b) =>
    `${a.route}:${a.method}`.localeCompare(`${b.route}:${b.method}`),
  )) {
    console.log(
      `${row.method.padEnd(6)} ${row.route.padEnd(55)} auth=${row.auth.padEnd(3)} role=${row.role.padEnd(3)} roles=[${row.roles}]`,
    );
  }

  console.log("\n== Findings ==\n");
  if (findings.length === 0) {
    console.log("No strict findings detected.");
  } else {
    for (const finding of findings) {
      console.log(
        `[${finding.severity}] ${finding.type} ${finding.method} ${finding.route} -> ${finding.detail}`,
      );
    }
  }

  console.log("\n== Advisory checks ==\n");
  if (advisories.length === 0) {
    console.log("No advisory items.");
    return;
  }
  for (const advisory of advisories) {
    console.log(
      `[${advisory.severity}] ${advisory.type} ${advisory.method} ${advisory.route} -> ${advisory.detail}`,
    );
  }
}

function main() {
  const args = parseArgs();
  const routeFiles = walkRoutes(apiRoot);
  const routes = routeFiles.map(analyzeRoute);
  const { findings, advisories } = findFindings(routes);

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          routes: routes.map((r) => ({
            file: r.file,
            route: r.route,
            usesAuthContext: r.usesAuthContext,
            methods: r.methods.filter((m) => m.mutating),
          })),
          findings,
          advisories,
        },
        null,
        2,
      ),
    );
  } else {
    printHuman(routes, findings, advisories);
  }

  if (args.failOnFindings && findings.length > 0) {
    process.exit(1);
  }
}

main();
