import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_GROUPS_BY_ROLE } from "@/components/dashboard/sidebar-nav-groups";
import { composeSidebarGroupsForRole } from "@/lib/navigation/compose-sidebar-groups";
import { isCustomerShellRole } from "@/lib/navigation/registry-resolver";
import { DASHBOARD_ROUTE_ACCESS_RULES } from "@/lib/security/dashboard-route-policy";
import type { UserRole } from "@/types/database";

function dashboardPagePath(href: string): string {
  const pathOnly = href.split("?")[0] ?? href;
  const segments = pathOnly.replace(/^\//, "").split("/").filter(Boolean);
  return join(process.cwd(), "src/app/(dashboard)", ...segments, "page.tsx");
}

function flattenRoleHrefs(role: UserRole): string[] {
  const groups = isCustomerShellRole(role)
    ? composeSidebarGroupsForRole({
        role,
        user: { role, is_org_admin: true },
      })
    : (NAV_GROUPS_BY_ROLE[role] ?? []);
  const hrefs = new Set<string>();
  for (const group of groups) {
    for (const item of group.items) {
      hrefs.add(item.href);
      for (const child of item.children ?? []) {
        hrefs.add(child.href);
      }
    }
  }
  return [...hrefs];
}

function flattenRoleItems(role: UserRole): Array<{ label: string; href: string }> {
  const groups = isCustomerShellRole(role)
    ? composeSidebarGroupsForRole({
        role,
        user: { role, is_org_admin: true },
      })
    : (NAV_GROUPS_BY_ROLE[role] ?? []);
  return groups.flatMap((group) =>
    group.items.flatMap((item) => [
      { label: item.label, href: item.href },
      ...(item.children ?? []).map((child) => ({ label: child.label, href: child.href })),
    ]),
  );
}

describe("dashboard nav and route-policy alignment", () => {
  const rules = DASHBOARD_ROUTE_ACCESS_RULES;

  it("ensures every nav link has a route policy prefix", () => {
    (Object.keys(NAV_GROUPS_BY_ROLE) as UserRole[]).forEach((role) => {
      const hrefs = flattenRoleHrefs(role);
      hrefs.forEach((href) => {
        const rule = rules.find(
          (entry) => href === entry.prefix || href.startsWith(`${entry.prefix}/`),
        );
        expect(
          rule,
          `Missing route policy for nav href "${href}" shown to role "${role}"`,
        ).toBeDefined();
      });
    });
  });

  it("ensures nav role is included in matching route policy", () => {
    (Object.keys(NAV_GROUPS_BY_ROLE) as UserRole[]).forEach((role) => {
      const hrefs = flattenRoleHrefs(role);
      hrefs.forEach((href) => {
        const rule = rules.find(
          (entry) => href === entry.prefix || href.startsWith(`${entry.prefix}/`),
        );
        expect(rule, `No route policy for href "${href}"`).toBeDefined();
        expect(
          rule?.roles.includes(role),
          `Role "${role}" can see nav "${href}" but is not allowed by route policy`,
        ).toBe(true);
      });
    });
  });

  it("ensures every static nav link resolves to a dashboard page", () => {
    (Object.keys(NAV_GROUPS_BY_ROLE) as UserRole[]).forEach((role) => {
      const hrefs = flattenRoleHrefs(role);
      hrefs.forEach((href) => {
        expect(
          existsSync(dashboardPagePath(href)),
          `Nav href "${href}" shown to role "${role}" has no dashboard page`,
        ).toBe(true);
      });
    });
  });

  it("uses product-clear labels for candidate and agency navigation", () => {
    expect(flattenRoleItems("candidate_pro")).toEqual(
      expect.arrayContaining([{ label: "Status & Scores", href: "/candidate/applications" }]),
    );
    expect(flattenRoleItems("agency")).toEqual(
      expect.arrayContaining([{ label: "Create client JD", href: "/agency/jobs/new" }]),
    );
  });
});
