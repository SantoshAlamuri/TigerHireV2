import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_REGISTRY, NAV_REGISTRY_CUSTOMER_ROLES, type NavUser } from "@/lib/navigation/registry";
import {
  getAncestry,
  getChildren,
  getEntryById,
  getVisibleChildren,
  getVisibleTopLevel,
  resolveNavEntryPath,
} from "@/lib/navigation/registry-helpers";

function dashboardPagePath(route: string): string {
  const pathOnly = route.split("?")[0] ?? route;
  const segments = pathOnly.replace(/^\//, "").split("/").filter(Boolean);
  return join(process.cwd(), "src/app/(dashboard)", ...segments, "page.tsx");
}

function collectResolvedPaths(): Set<string> {
  const paths = new Set<string>();
  for (const entry of NAV_REGISTRY) {
    if (entry.path) paths.add(entry.path);
    for (const role of NAV_REGISTRY_CUSTOMER_ROLES) {
      for (const is_org_admin of [false, true] as const) {
        const user: NavUser = { role, is_org_admin };
        if (!entry.visibleTo(user)) continue;
        const p = resolveNavEntryPath(entry, user);
        if (p) paths.add(p);
      }
    }
  }
  return paths;
}

describe("NAV_REGISTRY (Brief 1.5 Phase 1)", () => {
  it("has unique ids", () => {
    const seen = new Set<string>();
    for (const e of NAV_REGISTRY) {
      expect(seen.has(e.id), `Duplicate id: ${e.id}`).toBe(false);
      seen.add(e.id);
    }
  });

  it("has labels unique among siblings (same parent)", () => {
    const byParent = new Map<string | null, Set<string>>();
    for (const e of NAV_REGISTRY) {
      const labels = byParent.get(e.parent) ?? new Set();
      expect(
        labels.has(e.label),
        `Duplicate sibling label "${e.label}" under parent ${String(e.parent)}`,
      ).toBe(false);
      labels.add(e.label);
      byParent.set(e.parent, labels);
    }
  });

  it("has valid parent pointers", () => {
    const ids = new Set(NAV_REGISTRY.map((e) => e.id));
    for (const e of NAV_REGISTRY) {
      if (e.parent != null) {
        expect(ids.has(e.parent), `Missing parent id "${e.parent}" for "${e.id}"`).toBe(true);
      }
    }
  });

  it("has no circular parent chains (getAncestry)", () => {
    for (const e of NAV_REGISTRY) {
      expect(() => getAncestry(e.id)).not.toThrow();
      const chain = getAncestry(e.id);
      expect(chain[0]?.parent).toBeNull();
    }
  });

  it("maps every resolved path to an existing dashboard page.tsx", () => {
    for (const href of collectResolvedPaths()) {
      const file = dashboardPagePath(href);
      expect(existsSync(file), `Missing page for registry path "${href}" (${file})`).toBe(true);
    }
  });

  it("getChildren returns sorted siblings", () => {
    const kids = getChildren("jobs");
    expect(kids.length).toBeGreaterThan(0);
    for (let i = 1; i < kids.length; i++) {
      expect(kids[i]!.order).toBeGreaterThanOrEqual(kids[i - 1]!.order);
    }
  });

  it("getEntryById returns entries", () => {
    expect(getEntryById("nope")).toBeUndefined();
    expect(getEntryById("home")?.label).toBe("Home");
  });

  it("getVisibleChildren filters by visibleTo", () => {
    const hm: NavUser = { role: "hiring_manager", is_org_admin: false };
    const kids = getVisibleChildren("jobs", hm);
    expect(kids.some((c) => c.id === "jobs.org_overview")).toBe(false);
    expect(kids.some((c) => c.id === "jobs.pipeline")).toBe(true);
  });

  it("getVisibleChildren with navChromeOnly omits hub entries hidden in Phase 3", () => {
    const leader: NavUser = { role: "leadership", is_org_admin: false };
    const chrome = getVisibleChildren("jobs", leader, { navChromeOnly: true });
    expect(chrome.some((c) => c.id === "jobs.org_overview")).toBe(false);
    expect(chrome.some((c) => c.id === "jobs.recruiting_hub")).toBe(false);
    expect(chrome.some((c) => c.id === "jobs.pipeline")).toBe(true);
  });

  it("meets top-level item ceiling for nav chrome (≤7, or ≤8 when org admin adds Setup)", () => {
    for (const role of NAV_REGISTRY_CUSTOMER_ROLES) {
      for (const is_org_admin of [false, true] as const) {
        const user: NavUser = { role, is_org_admin };
        const top = getVisibleTopLevel(user, { navChromeOnly: true });
        const limit = is_org_admin ? 8 : 7;
        expect(
          top.length,
          `Role ${role} is_org_admin=${String(is_org_admin)} has ${top.length} chrome top-level nav entries`,
        ).toBeLessThanOrEqual(limit);
      }
    }
  });
});
