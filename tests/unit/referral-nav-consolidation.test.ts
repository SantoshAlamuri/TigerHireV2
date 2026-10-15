import { describe, expect, it } from "vitest";
import { NAV_REGISTRY, type NavUser } from "@/lib/navigation/registry";
import { resolveVisibleNavEntries } from "@/lib/navigation/registry-resolver";
import { NAV_GROUP_STRUCTURE_BY_ROLE } from "@/lib/navigation/sidebar-group-structure";
import type { UserRole } from "@/types/database";

/**
 * Referral nav after the 2026-08-01 consolidation.
 *
 * The employee seat carried four "Refer & Earn" entries. Three of them —
 * /dashboard/referrer, /employee/refer, /employee/my-referrals — all land on
 * /employee, because the latter two are five-line redirects and the first
 * bounces employees to the same hub. The finance seat, meanwhile, is who the
 * payout statement is for and had no referral entry at all.
 */

function navUser(role: UserRole): NavUser {
  return { role, is_org_admin: false };
}

function pathsFor(role: UserRole): string[] {
  return resolveVisibleNavEntries(navUser(role), { navChromeOnly: false }).map((e) => e.path);
}

function idsFor(role: UserRole): string[] {
  return resolveVisibleNavEntries(navUser(role), { navChromeOnly: false }).map((e) => e.id);
}

describe("employee referral nav", () => {
  it("no longer offers three routes to the same hub", () => {
    const paths = pathsFor("employee");
    expect(paths).not.toContain("/employee/refer");
    expect(paths).not.toContain("/employee/my-referrals");
    expect(paths).not.toContain("/company/referrals");
  });

  it("keeps the hub itself and the one genuinely distinct action", () => {
    const paths = pathsFor("employee");
    expect(paths).toContain("/employee");
    expect(paths).toContain("/dashboard/referrer/join");
  });

  it("collapses the sidebar to a single referral group", () => {
    const groups = NAV_GROUP_STRUCTURE_BY_ROLE.employee ?? [];
    const referral = groups.find((g) => g.label === "Refer & Earn");
    expect(referral?.entryIds).toEqual(["workspace", "referrals.join"]);
    expect(groups.some((g) => g.label === "Home")).toBe(false);
  });

  it("keeps the retired routes reachable — unlinking is not deleting", () => {
    // The redirect pages stay so existing WhatsApp links and bookmarks land
    // correctly; they are simply not signposted twice in the nav any more.
    const removed = ["workspace.refer", "workspace.my_referrals"];
    for (const id of removed) {
      expect(NAV_REGISTRY.some((e) => e.id === id)).toBe(false);
    }
  });
});

describe("finance referral statement", () => {
  it("gives the finance seat the report it reconciles", () => {
    expect(pathsFor("finance")).toContain("/company/finance/referral-statement");
    expect(idsFor("finance")).toContain("finance.referral_statement");
  });

  it("appears in the finance sidebar group", () => {
    const groups = NAV_GROUP_STRUCTURE_BY_ROLE.finance ?? [];
    const finance = groups.find((g) => g.label === "Finance");
    expect(finance?.entryIds).toContain("finance.referral_statement");
  });

  it("is not offered to seats that do not reconcile invoices", () => {
    for (const role of ["recruiter", "hiring_manager", "employee", "interviewer"] as UserRole[]) {
      expect(pathsFor(role)).not.toContain("/company/finance/referral-statement");
    }
  });
});

describe("company referral entry", () => {
  it("still routes leadership and recruiter to the confirm queue", () => {
    for (const role of ["leadership", "recruiter"] as UserRole[]) {
      expect(pathsFor(role)).toContain("/company/referrals");
    }
  });
});
