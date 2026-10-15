import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { composeSidebarGroupsForRole } from "@/lib/navigation/compose-sidebar-groups";
import { PRIMARY_NAV_BY_ROLE } from "@/lib/navigation/primary-nav-by-role";
import { NAV_REGISTRY, NAV_REGISTRY_CUSTOMER_ROLES, type NavUser } from "@/lib/navigation/registry";
import {
  isNavEntryVisible,
  resolveNavEntryForPath,
  resolveVisibleNavEntries,
} from "@/lib/navigation/registry-resolver";
import { resolveNavEntryPath } from "@/lib/navigation/registry-helpers";
import { NAV_GROUP_STRUCTURE_BY_ROLE } from "@/lib/navigation/sidebar-group-structure";
import { resolvePrimaryNavEntries } from "@/lib/navigation/resolve-primary-nav";
import type { UserRole } from "@/types/database";
import type { User } from "@/types";

function navUser(role: UserRole, is_org_admin = false): NavUser {
  return { role, is_org_admin };
}

function mockUser(role: UserRole, isOrgAdmin = false): User {
  return {
    id: "test",
    email: "test@example.com",
    name: "Test",
    role,
    createdAt: new Date().toISOString(),
    isOrgAdmin,
  };
}

const EXPECTED_PRIMARY_NAV_LABELS: Partial<Record<UserRole, string[]>> = {
  leadership: [
    "Overview",
    "Jobs",
    "Candidates",
    "Pipeline",
    "Interviews",
    "Assessments",
    "Tasks",
    "Offers",
    "Analytics",
    "Referrals",
  ],
  recruiter: [
    "Jobs",
    "Candidates",
    "Pipeline",
    "Interviews",
    "Assessments",
    "Tasks",
    "Offers",
    "Analytics",
    "Referrals",
  ],
  hiring_manager: [
    "Overview",
    "Pipeline",
    "Hiring requests",
    "Tasks",
    "Offers",
    "Analytics",
    "Interviews",
  ],
  interviewer: ["Home", "Interviews"],
  finance: ["Home", "Finance Inbox"],
  employee: ["Home"],
};

describe("nav resolver (Brief 4)", () => {
  beforeEach(() => {
    vi.stubEnv("FF_PLAN_DOCUMENT", "false");
    vi.stubEnv("NEXT_PUBLIC_FF_PLAN_DOCUMENT", "false");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolveVisibleNavEntries returns only visible entries with paths", () => {
    const user = navUser("recruiter");
    const visible = resolveVisibleNavEntries(user, { navChromeOnly: true });
    expect(visible.length).toBeGreaterThan(0);
    for (const entry of visible) {
      const reg = NAV_REGISTRY.find((e) => e.id === entry.id);
      expect(reg?.visibleTo(user)).toBe(true);
      expect(entry.path.startsWith("/")).toBe(true);
    }
  });

  it("resolveVisibleNavEntries excludes includeInNavChrome false by default", () => {
    const user = navUser("leadership");
    const visible = resolveVisibleNavEntries(user, { navChromeOnly: true });
    expect(visible.some((e) => e.id === "inbox")).toBe(false);
    expect(visible.some((e) => e.id === "jobs.org_overview")).toBe(false);
  });

  it("resolveVisibleNavEntries with navChromeOnly false includes promoted child entries", () => {
    const user = navUser("recruiter");
    const visible = resolveVisibleNavEntries(user, { navChromeOnly: false });
    expect(visible.some((e) => e.path === "/company/offers")).toBe(true);
    expect(visible.some((e) => e.path === "/recruit/assessments")).toBe(true);
  });

  it("isNavEntryVisible matches registry visibility", () => {
    const user = navUser("finance");
    expect(isNavEntryVisible("finance", user)).toBe(true);
    expect(isNavEntryVisible("candidates", user)).toBe(false);
  });

  it("primary nav labels omit Interviews for recruiter when plan document flag is on", () => {
    vi.stubEnv("FF_PLAN_DOCUMENT", "true");
    const user = mockUser("recruiter");
    const resolverUser = navUser("recruiter");
    const groups = composeSidebarGroupsForRole({ role: "recruiter", user: resolverUser });
    const primary = resolvePrimaryNavEntries(user, groups, resolverUser);
    const labels = primary.map((p) => p.label);
    expect(labels).not.toContain("Interviews");
    expect(labels).toEqual([
      "Jobs",
      "Candidates",
      "Pipeline",
      "This week",
      "Tasks",
      "Analytics",
      "Referrals",
    ]);
    vi.unstubAllEnvs();
  });

  for (const role of NAV_REGISTRY_CUSTOMER_ROLES) {
    it(`primary nav labels for ${role} match PRIMARY_NAV_BY_ROLE`, () => {
      const user = mockUser(role);
      const resolverUser = navUser(role);
      const groups = composeSidebarGroupsForRole({ role, user: resolverUser });
      const primary = resolvePrimaryNavEntries(user, groups, resolverUser);
      const labels = primary.map((p) => p.label);
      expect(labels).toEqual(EXPECTED_PRIMARY_NAV_LABELS[role]);
    });
  }

  it("primary nav paths are a subset of registry-resolved paths (navChromeOnly false)", () => {
    for (const role of NAV_REGISTRY_CUSTOMER_ROLES) {
      const user = mockUser(role);
      const resolverUser = navUser(role);
      const visible = resolveVisibleNavEntries(resolverUser, { navChromeOnly: false });
      const visiblePaths = new Set(visible.map((e) => e.path));
      const groups = composeSidebarGroupsForRole({ role, user: resolverUser });
      const primary = resolvePrimaryNavEntries(user, groups, resolverUser);
      for (const item of primary) {
        expect(visiblePaths.has(item.href), `Missing visible path ${item.href} for ${role}`).toBe(
          true,
        );
      }
    }
  });

  it("sidebar hrefs are a subset of registry-resolved paths", () => {
    for (const role of NAV_REGISTRY_CUSTOMER_ROLES) {
      const user = navUser(role);
      const visible = resolveVisibleNavEntries(user, { navChromeOnly: false });
      const visiblePaths = new Set(visible.map((e) => e.path));
      const groups = composeSidebarGroupsForRole({ role, user });
      const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
      for (const href of hrefs) {
        expect(visiblePaths.has(href), `Sidebar href ${href} not in registry for ${role}`).toBe(
          true,
        );
      }
    }
  });

  it("resolves /employee to workspace Home for employees (not referrals Refer alias)", () => {
    const user = navUser("employee");
    const resolved = resolveNavEntryForPath("/employee", user, { navChromeOnly: false });
    expect(resolved?.id).toBe("workspace");
    expect(resolved?.label).toBe("Home");
  });

  it("every PRIMARY_NAV_BY_ROLE path resolves for customer roles", () => {
    for (const role of NAV_REGISTRY_CUSTOMER_ROLES) {
      const user = navUser(role);
      const hrefs = PRIMARY_NAV_BY_ROLE[role] ?? [];
      for (const href of hrefs) {
        const resolved = resolveNavEntryForPath(href, user, { navChromeOnly: false });
        expect(resolved, `No registry entry for ${role} path ${href}`).not.toBeNull();
      }
    }
  });

  it("every sidebar entryId exists in NAV_REGISTRY", () => {
    const ids = new Set(NAV_REGISTRY.map((e) => e.id));
    for (const role of NAV_REGISTRY_CUSTOMER_ROLES) {
      const templates = NAV_GROUP_STRUCTURE_BY_ROLE[role] ?? [];
      for (const group of templates) {
        for (const entryId of group.entryIds) {
          expect(ids.has(entryId), `Unknown entryId "${entryId}" for role ${role}`).toBe(true);
        }
      }
    }
  });

  it("registry paths for customer roles remain stable for legacy href coverage", () => {
    const hrefs = [
      "/home",
      "/recruit/pipeline",
      "/company/interviews",
      "/company/offers",
      "/recruit/assessments",
      "/employee",
      "/dashboard/referrer",
    ];
    for (const href of hrefs) {
      let covered = false;
      for (const role of NAV_REGISTRY_CUSTOMER_ROLES) {
        const user = navUser(role);
        for (const entry of NAV_REGISTRY) {
          if (!entry.visibleTo(user)) continue;
          if (resolveNavEntryPath(entry, user) === href) covered = true;
        }
      }
      expect(covered, `href ${href} not covered`).toBe(true);
    }
  });
});
