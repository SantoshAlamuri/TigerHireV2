import { describe, it, expect } from "vitest";
import { resolveDashboardRouteAccessRule } from "@/lib/security/dashboard-route-policy";
import { capabilitiesFor, type Capabilities } from "@/lib/v2/seat-capabilities";
import type { UserRole } from "@/types/database";

/**
 * Who can open what, stated once and checked as a whole.
 *
 * The two walls around the v2 tree are enforced in different places — route
 * policy admits a role to a prefix, and each page then gates on a capability —
 * and neither file can see the other. That is deliberate: either alone should
 * hold. But it also means the COMBINATION was never written down anywhere, so
 * "can an agency open the talent pool?" could only be answered by reading two
 * files and holding the middle in your head.
 *
 * This is that combination, as a table. It is the answer a person actually
 * wants, and it fails if either wall moves.
 */
type Seat = "recruiter" | "leadership" | "hiring_manager" | "agency";

interface Screen {
  path: string;
  /** The capability the page's SeatGate requires. */
  need: keyof Capabilities;
  what: string;
}

/** Every screen in the v2 tree that gates on a capability. */
const SCREENS: Screen[] = [
  { path: "/recruit/v2/candidates/pool", need: "viewAllCandidates", what: "talent pool" },
  { path: "/recruit/v2/candidates/abc", need: "viewAllCandidates", what: "candidate profile" },
  { path: "/recruit/v2/setup", need: "editJobSetup", what: "Hiring Setup" },
  { path: "/recruit/v2/setup/rubric", need: "editJobSetup", what: "rubric library" },
  { path: "/recruit/v2/setup/rubric/abc", need: "editJobSetup", what: "rubric detail" },
  { path: "/recruit/v2/setup/benchmarks", need: "editJobSetup", what: "benchmarks" },
  { path: "/recruit/v2/portfolio", need: "viewPortfolio", what: "portfolio" },
  { path: "/recruit/v2/governance", need: "approveRubrics", what: "sign-off queue" },
  { path: "/recruit/v2/jobs/abc/review", need: "reviewApplications", what: "review queue" },
  { path: "/recruit/v2/jobs/abc/stage/applied", need: "reviewApplications", what: "stage list" },
  { path: "/recruit/v2/jobs/abc/add", need: "reviewApplications", what: "bulk intake" },
  { path: "/recruit/v2/jobs/abc/offers", need: "reviewApplications", what: "offers" },
  { path: "/recruit/v2/jobs/abc/interviews", need: "reviewApplications", what: "interviews" },
  { path: "/recruit/v2/jobs/abc/setup", need: "editJobSetup", what: "job setup" },
  { path: "/recruit/jobs/abc/setup", need: "editJobSetup", what: "canonical job setup" },
  { path: "/recruit/v2/jobs/abc/feedback", need: "submitFeedback", what: "feedback" },
  { path: "/recruit/v2/candidates/abc/scorecard", need: "submitFeedback", what: "scorecard" },
  { path: "/recruit/v2/candidates/abc/brief", need: "submitFeedback", what: "interview brief" },
  { path: "/recruit/v2/jobs/abc/submit", need: "submitCandidates", what: "agency submit" },
  {
    path: "/recruit/v2/candidates/abc/submission",
    need: "viewOwnSubmissions",
    what: "agency submission view",
  },
];

/** True only when BOTH walls let this seat through. */
function canOpen(seat: Seat, screen: Screen): boolean {
  const rule = resolveDashboardRouteAccessRule(screen.path);
  const admittedByRoute = rule ? rule.roles.includes(seat as UserRole) : false;
  return admittedByRoute && capabilitiesFor(seat)[screen.need];
}

describe("v2 access matrix — route policy AND page gate together", () => {
  /**
   * The list that would have caught the 2026-07-30 leak. Everything an agency
   * must never reach, named, so a change to either wall shows up here as a
   * behaviour change rather than as a diff someone has to interpret.
   */
  it("keeps an agency out of every client-internal screen", () => {
    const reachable = SCREENS.filter(
      (s) => !["agency submit", "agency submission view"].includes(s.what),
    )
      .filter((s) => canOpen("agency", s))
      .map((s) => `${s.what} (${s.path})`);
    expect(reachable).toEqual([]);
  });

  it("lets an agency reach exactly the two screens built for it", () => {
    const reachable = SCREENS.filter((s) => canOpen("agency", s)).map((s) => s.what);
    expect(reachable.sort()).toEqual(["agency submission view", "agency submit"]);
  });

  it("gives a recruiter their whole desk", () => {
    const denied = SCREENS.filter(
      (s) => !["agency submission view"].includes(s.what) && !canOpen("recruiter", s),
    ).map((s) => s.what);
    // A recruiter does not need the agency's own submission view, and does not
    // sign off on the bar they built.
    expect(denied.sort()).toEqual(["sign-off queue"]);
  });

  it("gives leadership everything a recruiter has, plus the sign-off queue", () => {
    for (const s of SCREENS) {
      if (canOpen("recruiter", s)) {
        expect(canOpen("leadership", s), `leadership lost ${s.what}`).toBe(true);
      }
    }
    expect(canOpen("leadership", SCREENS.find((s) => s.what === "sign-off queue")!)).toBe(true);
  });

  it("keeps the hiring manager to what they are accountable for", () => {
    const reachable = SCREENS.filter((s) => canOpen("hiring_manager", s)).map((s) => s.what);
    // Feedback, scorecard and brief — a decision seat, never a triage seat.
    expect(reachable.sort()).toEqual(["feedback", "interview brief", "scorecard"]);
  });

  it("never lets a hiring manager into the applicant queue or setup", () => {
    for (const what of ["review queue", "stage list", "Hiring Setup", "talent pool"]) {
      const screen = SCREENS.find((s) => s.what === what)!;
      expect(canOpen("hiring_manager", screen), `HM reached ${what}`).toBe(false);
    }
  });

  /**
   * Guards the guard. If route policy stopped admitting agency to the prefix,
   * every "agency is kept out" assertion above would pass for the wrong reason
   * and the page-level gates would go unverified.
   */
  it("is testing the inner wall, not just the outer one", () => {
    const rule = resolveDashboardRouteAccessRule("/recruit/v2/candidates/pool");
    expect(rule?.roles).toContain("agency");
    // So the only thing stopping them above is the capability check.
    expect(capabilitiesFor("agency").viewAllCandidates).toBe(false);
  });
});
