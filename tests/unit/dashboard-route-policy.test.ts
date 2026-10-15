import { describe, it, expect } from "vitest";
import {
  DASHBOARD_ROUTE_ACCESS_RULES,
  DASHBOARD_MIDDLEWARE_PREFIX_ROLES,
  DASHBOARD_MIDDLEWARE_PROTECTED_PREFIXES,
  resolveDashboardRouteAccessRule,
} from "@/lib/security/dashboard-route-policy";

describe("dashboard-route-policy", () => {
  it("exports middleware prefix list aligned with role map", () => {
    for (const p of DASHBOARD_MIDDLEWARE_PROTECTED_PREFIXES) {
      expect(DASHBOARD_MIDDLEWARE_PREFIX_ROLES[p]).toBeDefined();
      expect(DASHBOARD_MIDDLEWARE_PREFIX_ROLES[p].length).toBeGreaterThan(0);
    }
    expect(DASHBOARD_MIDDLEWARE_PROTECTED_PREFIXES.length).toBe(
      Object.keys(DASHBOARD_MIDDLEWARE_PREFIX_ROLES).length,
    );
  });

  it("lists more-specific paths before shorter shared prefixes", () => {
    const idx = (p: string) => DASHBOARD_ROUTE_ACCESS_RULES.findIndex((r) => r.prefix === p);
    expect(idx("/company/settings/offer-letter-templates")).toBeLessThan(idx("/company/settings"));
    expect(idx("/company/settings/offer-approval-workflow")).toBeLessThan(idx("/company/settings"));
    expect(idx("/company/settings/pipeline")).toBeLessThan(idx("/company/settings"));
    expect(idx("/company/settings")).toBeLessThan(idx("/company"));
    expect(idx("/company/approvals")).toBeLessThan(idx("/company"));
    expect(idx("/company/offers/draft")).toBeLessThan(idx("/company/offers"));
    expect(idx("/company/offers")).toBeLessThan(idx("/company"));
    expect(idx("/company/assessments")).toBeLessThan(idx("/company"));
    expect(idx("/company/referrals")).toBeLessThan(idx("/company"));
    expect(idx("/recruit/settings/pipeline")).toBeLessThan(idx("/recruit"));
    expect(idx("/recruit/candidates")).toBeLessThan(idx("/recruit"));
    expect(idx("/recruit/analytics")).toBeLessThan(idx("/recruit"));
    expect(idx("/recruit/jobs")).toBeLessThan(idx("/recruit"));
    expect(idx("/company/settings/pipeline")).toBeLessThan(idx("/company/settings"));
    expect(idx("/company/settings/screening")).toBeLessThan(idx("/company/settings"));
  });

  it("allows hiring_manager on /recruit/jobs for Brief 11 plan workspace", () => {
    const rule = resolveDashboardRouteAccessRule(
      "/recruit/jobs/861e8c58-9c72-4c46-8534-a02207a35cbc",
    );
    expect(rule?.prefix).toBe("/recruit/jobs");
    expect(rule?.roles).toContain("hiring_manager");
  });
});
