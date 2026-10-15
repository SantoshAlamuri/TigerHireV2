import { describe, expect, it } from "vitest";
import type { UserRole } from "@/types/database";
import { NAV_GROUPS_BY_ROLE } from "@/components/dashboard/sidebar-nav-groups";
import {
  DASHBOARD_ROUTE_ACCESS_RULES,
  matchesSetupPrefix,
  shouldRedirectNonOrgAdminFromOrgConfigPath,
} from "@/lib/security/dashboard-route-policy";
import { HOME_TILES, type HomeTileUserContext } from "@/lib/home/tile-registry";

function navHrefsForRole(role: UserRole): Set<string> {
  const out = new Set<string>();
  for (const group of NAV_GROUPS_BY_ROLE[role] ?? []) {
    for (const item of group.items) {
      out.add(item.href);
      if (item.children) {
        for (const c of item.children) out.add(c.href);
      }
    }
  }
  return out;
}

function tileIdsVisible(ctx: HomeTileUserContext): string[] {
  return HOME_TILES.filter((t) => t.visibleTo(ctx)).map((t) => t.id);
}

/** Mirrors `TopNavigation` setup gear (Brief 1). */
function showSetupGear(isOrgAdmin: boolean): boolean {
  return Boolean(isOrgAdmin);
}

/** Mirrors `proxy` setup branch — 403 when setup path and not org admin. */
function setupRequestWould403(pathname: string, isOrgAdmin: boolean): boolean {
  return matchesSetupPrefix(pathname) && !isOrgAdmin;
}

const billingRule = DASHBOARD_ROUTE_ACCESS_RULES.find((r) => r.prefix === "/company/billing");

describe("Brief 1 role × is_org_admin matrix (leadership & recruiter)", () => {
  it("exposes company billing to org settings–eligible roles plus super_admin", () => {
    expect(billingRule?.roles).toContain("leadership");
    expect(billingRule?.roles).toContain("recruiter");
    expect(billingRule?.roles).toContain("super_admin");
  });

  it("super_admin without org admin flag may reach /company/billing but not /company/settings", () => {
    expect(
      shouldRedirectNonOrgAdminFromOrgConfigPath("/company/billing", false, "super_admin"),
    ).toBe(false);
    expect(
      shouldRedirectNonOrgAdminFromOrgConfigPath("/company/settings", false, "super_admin"),
    ).toBe(true);
  });

  const matrix: Array<{
    role: "leadership" | "recruiter";
    is_org_admin: boolean;
  }> = [
    { role: "leadership", is_org_admin: true },
    { role: "leadership", is_org_admin: false },
    { role: "recruiter", is_org_admin: true },
    { role: "recruiter", is_org_admin: false },
  ];

  for (const { role, is_org_admin } of matrix) {
    describe(`${role} + is_org_admin=${is_org_admin}`, () => {
      it("home tile visibility matches role only (flag reserved; no tile gates on it yet)", () => {
        const withFlag = tileIdsVisible({ role, is_org_admin: true });
        const without = tileIdsVisible({ role, is_org_admin: false });
        expect(withFlag).toEqual(without);
        if (role === "leadership") {
          expect(withFlag).toEqual(
            expect.arrayContaining([
              "lh-open-roles",
              "lh-pipeline-7d",
              "lh-offers-30d",
              "lh-referral-leaders",
            ]),
          );
          expect(withFlag).toHaveLength(4);
        } else {
          expect(withFlag).toEqual(
            expect.arrayContaining([
              "rc-applications-today",
              "rc-pipeline-rows",
              "rc-jobs-open",
              "rc-stale-pipeline",
            ]),
          );
          expect(withFlag).toHaveLength(4);
        }
      });

      it("setup gear matches org admin flag", () => {
        expect(showSetupGear(is_org_admin)).toBe(is_org_admin);
      });

      it("setup path returns 403 proxy semantics when not org admin", () => {
        expect(setupRequestWould403("/setup", is_org_admin)).toBe(!is_org_admin);
        expect(setupRequestWould403("/setup/platform/integrations", is_org_admin)).toBe(
          !is_org_admin,
        );
        expect(setupRequestWould403("/setup/hiring-config/pipeline", is_org_admin)).toBe(
          !is_org_admin,
        );
      });

      it("company config paths redirect when not org admin (billing included)", () => {
        expect(
          shouldRedirectNonOrgAdminFromOrgConfigPath("/company/settings", is_org_admin, role),
        ).toBe(!is_org_admin);
        expect(
          shouldRedirectNonOrgAdminFromOrgConfigPath("/company/billing", is_org_admin, role),
        ).toBe(!is_org_admin);
      });

      it("sidebar no longer lists home; org setup is not duplicated under /setup or /company/settings", () => {
        const hrefs = navHrefsForRole(role);
        // /home is retired for the hiring seats — their tiles became the Jobs
        // list and the Portfolio. It stays for interviewer and finance, whom
        // the redesign never covered (tests/unit/home-retirement.test.ts).
        expect(hrefs.has("/home")).toBe(false);
        expect(hrefs.has("/setup")).toBe(false);
        expect([...hrefs].some((h) => h.startsWith("/company/settings"))).toBe(false);
      });
    });
  }
});
