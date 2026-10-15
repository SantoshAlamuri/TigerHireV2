import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROLE_DASHBOARD_PATH } from "@/types/database";
import { getPrimaryNavHrefsForRole } from "@/lib/navigation/primary-nav-by-role";
import { resolveDashboardRouteAccessRule } from "@/lib/security/dashboard-route-policy";
import type { UserRole } from "@/types/database";

/**
 * /home is retired for the seats that outgrew it — and only those.
 *
 * The three hiring seats each got a screen that does what their tiles did, and
 * better: the recruiter's four tiles are columns on the Jobs list with a
 * blocker attached, leadership's are the Portfolio, and the hiring manager's
 * are "Your week" plus the requisitions they raised. Keeping a tile grid in
 * front of those is a click that restates the next screen.
 *
 * Interviewer and finance are a different matter. The approved design covers
 * five seats and neither is among them, so nothing replaced their tiles.
 * Removing /home for everyone would leave them with one nav item and nowhere to
 * start — the "leaner is the goal, lesser is not" line from the convergence
 * plan, which this repo has already crossed once.
 */
const OUTGREW: UserRole[] = ["recruiter", "leadership", "hiring_manager"];
const STILL_NEED: UserRole[] = ["interviewer", "finance"];

describe("/home retirement", () => {
  it("is gone from the top nav of the seats that outgrew it", () => {
    for (const role of OUTGREW) {
      expect(
        getPrimaryNavHrefsForRole(role),
        `${role} still has /home in the top nav`,
      ).not.toContain("/home");
    }
  });

  it("is still in the top nav of the seats that have nothing else", () => {
    for (const role of STILL_NEED) {
      expect(getPrimaryNavHrefsForRole(role), `${role} lost its only landing page`).toContain(
        "/home",
      );
    }
  });

  it("is gone from the sidebar of the same three, and kept for the same two", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/dashboard/sidebar-nav-groups.tsx"),
      "utf8",
    );
    // Sidebar groups are a static literal keyed by role; slice each role's block
    // and look inside it rather than counting occurrences file-wide.
    const block = (role: string) => {
      const start = src.indexOf(`\n  ${role}: [`);
      if (start === -1) return "";
      const rest = src.slice(start + 1);
      const next = rest.search(/\n  [a-z_]+: \[/);
      return next === -1 ? rest : rest.slice(0, next);
    };
    for (const role of OUTGREW) {
      expect(block(role), `${role} sidebar still links /home`).not.toContain('href: "/home"');
    }
    for (const role of STILL_NEED) {
      expect(block(role), `${role} sidebar lost /home`).toContain('href: "/home"');
    }
  });

  it("lands each seat somewhere that exists in its own nav", () => {
    // A landing page nobody can navigate back to is a dead end.
    for (const role of [...OUTGREW, ...STILL_NEED]) {
      const landing = ROLE_DASHBOARD_PATH[role];
      const rule = resolveDashboardRouteAccessRule(landing);
      expect(rule, `${landing} has no route rule at all`).not.toBeNull();
      expect(rule?.roles, `${role} cannot open its own landing page ${landing}`).toContain(role);
    }
  });

  /**
   * Unlinking is not deleting. The page still exists and route policy still
   * admits these roles, so an old bookmark or a link in someone's email keeps
   * working — it just is not somewhere the product sends people any more.
   */
  it("leaves the page reachable, so no bookmark dies", () => {
    const rule = resolveDashboardRouteAccessRule("/home");
    for (const role of [...OUTGREW, ...STILL_NEED]) {
      expect(rule?.roles, `${role} can no longer open a /home bookmark`).toContain(role);
    }
  });
});
