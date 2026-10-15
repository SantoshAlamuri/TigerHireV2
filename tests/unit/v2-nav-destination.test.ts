import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Where "Analytics" points.
 *
 * This migration shipped half-done twice. The sidebar and hub quick-links were
 * moved to v2 while the top nav — the one people actually click — still went to
 * the old report, so v2 was reachable only by typing the URL and the operator
 * kept seeing v1 and reasonably concluded nothing had changed.
 *
 * The destination now lives in one constant. This asserts no nav component
 * hard-codes the old path around it.
 */
const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx") || full.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("analytics nav destination", () => {
  it("is defined once, as a constant", () => {
    const src = readFileSync(join(ROOT, "src/lib/navigation/primary-nav-by-role.ts"), "utf8");
    expect(src).toContain('export const ANALYTICS_HREF = "/recruit/analytics"');
    // Every role list must use the constant, never a literal, so the path
    // cannot go stale in five of six places.
    expect(src.match(/"\/recruit\/analytics"/g) ?? []).toHaveLength(1);
  });

  it("has no component still pointing at the retired v2 analytics path", () => {
    const offenders: string[] = [];
    for (const f of walk(join(ROOT, "src/components"))) {
      const src = readFileSync(f, "utf8");
      // An href to the old page is the bug. Active-path mappings may still list
      // it so the nav item highlights on either route.
      // The parallel v2 prefix is what produced a half-migrated nav; analytics
      // now lives on its canonical route and nothing should point back.
      for (const m of src.matchAll(/["']\/recruit\/v2\/analytics["']/g)) {
        offenders.push(`${f.slice(ROOT.length)} → ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * Every rail link must land on a page that exists.
 *
 * Jobs and Candidates converged onto canonical routes and their v2 copies were
 * deleted, but the rail still pointed at the retired prefix — so the two most
 * used links in the shell 404'd for every seat. Nothing in CI noticed, because
 * nothing was comparing the hrefs against the filesystem. This does.
 */
describe("seat rail destinations", () => {
  const APP = join(ROOT, "src/app/(dashboard)");

  /** Next resolves /a/b to a/b/page.tsx, allowing for dynamic segments. */
  function routeExists(href: string): boolean {
    const segments = href.replace(/^\//, "").split("/");
    let dirs = [APP];
    for (const seg of segments) {
      const next: string[] = [];
      for (const d of dirs) {
        let entries: string[];
        try {
          entries = readdirSync(d);
        } catch {
          continue;
        }
        for (const e of entries) {
          const full = join(d, e);
          if (!statSync(full).isDirectory()) continue;
          // Route groups like (dashboard) do not consume a URL segment.
          if (e.startsWith("(") && e.endsWith(")")) {
            entries.push(...readdirSync(full).map((c) => join(e, c)));
            continue;
          }
          if (e === seg) next.push(full);
        }
      }
      if (next.length === 0) return false;
      dirs = next;
    }
    return dirs.some((d) => {
      try {
        return readdirSync(d).includes("page.tsx");
      } catch {
        return false;
      }
    });
  }

  it("can tell a real route from a retired one", () => {
    // Guards the guard: a resolver that returned true for everything would pass
    // the assertion below while the rail was entirely broken.
    expect(routeExists("/recruit/jobs")).toBe(true);
    expect(routeExists("/recruit/v2/jobs")).toBe(false);
    expect(routeExists("/recruit/v2/candidates")).toBe(false);
  });

  it("resolves every v2 destination the nav offers, for every seat", async () => {
    const { NAV_REGISTRY } = await import("@/lib/navigation/registry");
    const roles = ["recruiter", "leadership", "super_admin", "hiring_manager", "agency"] as const;
    const dead: string[] = [];
    for (const role of roles) {
      for (const admin of [false, true]) {
        for (const entry of NAV_REGISTRY) {
          if (!entry.path?.startsWith("/recruit/v2")) continue;
          if (!entry.visibleTo({ role: role as never, is_org_admin: admin })) continue;
          if (!routeExists(entry.path)) dead.push(`${role}: ${entry.label} → ${entry.path}`);
        }
      }
    }
    expect(dead).toEqual([]);
  });

  /**
   * The rail is the regression this guards against coming back.
   *
   * /recruit/v2 shipped with its own left-hand nav while sitting inside the
   * dashboard shell, so every screen under it drew two navigations — with Jobs,
   * Candidates and Analytics appearing in both. The layout is a pass-through
   * now; a `<nav>` reappearing in it means the second nav is back.
   */
  it("has no second navigation inside the v2 layout", () => {
    const src = readFileSync(join(ROOT, "src/app/(dashboard)/recruit/v2/layout.tsx"), "utf8");
    expect(src).not.toMatch(/<nav[\s>]/);
    expect(src).not.toMatch(/from "next\/link"/);
  });

  /**
   * The job workspace and the candidate profile converged onto canonical
   * routes; their v2 index pages were deleted. Five links across the jobs list,
   * the candidates list, two analytics tables and the setup sequence still
   * pointed at the retired index, so "open this job" 404'd from every one of
   * them. The sub-routes (/review, /setup, /stage/…) do still live under v2 and
   * are fine — it is specifically the index that is gone.
   */
  it("has no link to a v2 index page that no longer exists", () => {
    const offenders: string[] = [];
    for (const f of walk(join(ROOT, "src"))) {
      if (f.includes("/recruit/v2/")) continue; // internal relative nav, checked by routing
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/`\/recruit\/v2\/(jobs|candidates)\/\$\{[^}]+\}`/g)) {
        offenders.push(`${f.slice(ROOT.length)} → ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("v2 route policy", () => {
  it("admits every in-org seat, and the agency now that the tree gates itself", () => {
    // Agency was excluded while these screens did no role check of their own —
    // one line here was the entire boundary between an external partner and
    // the client's candidate database. It is now the OUTER of two walls; the
    // inner one is asserted in v2-seat-gating.test.ts, and either alone holds.
    const src = readFileSync(join(ROOT, "src/lib/security/dashboard-route-policy.ts"), "utf8");
    const entry = src.slice(src.indexOf('prefix: "/recruit/v2"'));
    const roles = entry.slice(0, entry.indexOf("]"));
    expect(roles).toContain("hiring_manager");
    expect(roles).toContain("agency");
  });
});
