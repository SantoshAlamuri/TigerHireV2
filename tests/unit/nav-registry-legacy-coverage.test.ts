import { describe, expect, it } from "vitest";
import type { NavUser } from "@/lib/navigation/registry";
import { NAV_REGISTRY, NAV_REGISTRY_CUSTOMER_ROLES } from "@/lib/navigation/registry";
import { resolveNavEntryPath } from "@/lib/navigation/registry-helpers";

/**
 * Every non-redirect href that appears in `PRIMARY_NAV_BY_ROLE` (customer roles) or
 * `NAV_GROUPS_BY_ROLE` (customer roles) before Brief 1.5 Phase 2 — must be representable
 * by the Phase 1 registry (literal `path` or `resolvePath` for some visible user).
 *
 * Redirect-only legacy URLs are intentionally omitted (Phase 3 removes those pages).
 */
const LEGACY_CUSTOMER_NAV_HREFS = [
  "/home",
  "/company",
  "/recruit",
  "/recruit/pipeline",
  "/company/my-pipeline",
  "/recruit/interview-prep",
  "/recruit/assessments",
  "/company/offers",
  "/company/offers/draft",
  "/tasks",
  "/company/hiring-requests",
  "/company/jobs",
  "/recruit/jobs",
  "/company/my-jobs",
  "/recruit/candidates",
  "/company/interviews",
  "/recruit/applications",
  "/recruit/analytics",
  "/recruit/saved-searches",
  "/company/finance",
  "/employee",
  "/dashboard/referrer",
  "/employee/resign",
  "/company/my-settings/integrations",
] as const;

function hrefCoveredByRegistry(href: string): boolean {
  for (const entry of NAV_REGISTRY) {
    if (entry.path === href) return true;
    for (const role of NAV_REGISTRY_CUSTOMER_ROLES) {
      for (const is_org_admin of [false, true] as const) {
        const user: NavUser = { role, is_org_admin };
        if (!entry.visibleTo(user)) continue;
        if (resolveNavEntryPath(entry, user) === href) return true;
      }
    }
  }
  return false;
}

describe("NAV_REGISTRY legacy nav href coverage", () => {
  it("covers every legacy customer-shell nav href (non-redirect)", () => {
    for (const href of LEGACY_CUSTOMER_NAV_HREFS) {
      expect(hrefCoveredByRegistry(href), `No registry entry resolves to "${href}"`).toBe(true);
    }
  });
});
