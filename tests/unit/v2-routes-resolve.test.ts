import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard against dead links in the v2 tree.
 *
 * Every broken link this repo has shipped came from composing a path that
 * looked plausible — /recruit/v2/jobs/[id]/scoring, /recruit/settings/job-boards
 * — against a route that does not exist. This walks the real filesystem routes
 * and fails if any href in the v2 tree cannot land.
 */
const APP = join(process.cwd(), "src/app");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(APP);

/** Real page routes, with route groups like (dashboard) stripped. */
const routes = files
  .filter((f) => f.endsWith("/page.tsx"))
  .map(
    (f) =>
      f
        .slice(APP.length)
        .replace("/page.tsx", "")
        .replace(/\/\([^/)]+\)/g, "") || "/",
  );

function resolves(href: string): boolean {
  const path = href.split("?")[0].split("#")[0].replace(/\/$/, "") || "/";
  const segs = path === "/" ? [] : path.slice(1).split("/");
  return routes.some((r) => {
    const rs = r === "/" ? [] : r.slice(1).split("/");
    if (rs.length !== segs.length) return false;
    return rs.every((seg, i) => seg.startsWith("[") || seg === segs[i]);
  });
}

const v2Files = files.filter(
  (f) => f.includes("/recruit/v2/") && (f.endsWith(".tsx") || f.endsWith(".ts")),
);

describe("v2 links all resolve", () => {
  it("has v2 pages to check", () => {
    expect(v2Files.length).toBeGreaterThan(5);
  });

  it("never links to a route that does not exist", () => {
    const broken: string[] = [];
    for (const file of v2Files) {
      const src = readFileSync(file, "utf8");
      const matches = src.matchAll(/href=(?:\{`([^`]+)`\}|"([^"]+)")/g);
      for (const m of matches) {
        const raw = m[1] ?? m[2];
        if (!raw || raw.startsWith("http") || raw.startsWith("mailto")) continue;
        // Template params become a probe segment.
        const probe = raw.replace(/\$\{[^}]+\}/g, "X");
        if (!resolves(probe)) broken.push(`${raw}  (in ${file.slice(APP.length)})`);
      }
    }
    expect(broken).toEqual([]);
  });
});

/**
 * The same guard for API endpoints.
 *
 * The v2 interviews page fetched /api/jobs/[id]/interviews for weeks. That
 * folder exists — it holds /cancel, /ics, /book — but has no route.ts of its
 * own, so every request 404'd and the page rendered "no interviews scheduled"
 * regardless of how many were booked. A missing endpoint fails silently in the
 * UI as an empty state, which is indistinguishable from real emptiness. That is
 * exactly the class of bug this file exists to stop, and it only covered links.
 */
const apiRoutes = files
  .filter((f) => f.endsWith("/route.ts"))
  .map((f) =>
    f
      .slice(APP.length)
      .replace("/route.ts", "")
      .replace(/\/\([^/)]+\)/g, ""),
  );

function apiResolves(path: string): boolean {
  const clean = path.split("?")[0].replace(/\/$/, "");
  const segs = clean.slice(1).split("/");
  return apiRoutes.some((r) => {
    const rs = r.slice(1).split("/");
    if (rs.length !== segs.length) return false;
    return rs.every((seg, i) => seg.startsWith("[") || seg === segs[i]);
  });
}

describe("v2 fetches endpoints that exist", () => {
  const v2Files = files.filter((f) => f.includes("/recruit/v2/") && f.endsWith(".tsx"));

  it("every /api path used in the v2 tree has a route handler", () => {
    const dead: string[] = [];
    for (const f of v2Files) {
      const src = readFileSync(f, "utf8");
      // Template holes stand in for ids, which the [param] match handles.
      for (const m of src.matchAll(/["'`](\/api\/[A-Za-z0-9\-_/[\]${}.]*)["'`]/g)) {
        const path = m[1].replace(/\$\{[^}]*\}/g, "x").replace(/\/$/, "");
        if (path.includes("[") || path.length < 5) continue;
        if (!apiResolves(path)) dead.push(`${f.slice(APP.length)} → ${path}`);
      }
    }
    expect(dead).toEqual([]);
  });
});
