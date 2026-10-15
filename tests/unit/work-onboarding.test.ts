import { describe, expect, it } from "vitest";
import {
  ONBOARDING_HINTS,
  adminSteps,
  currentStep,
  isOnboardingEntry,
  needsOnboarding,
  onboardingKind,
  type AdminFacts,
} from "@/lib/work/onboarding";
import { resolveDashboardRouteAccessRule } from "@/lib/security/dashboard-route-policy";

const fresh: AdminFacts = {
  calendarConnected: false,
  teamSize: 1,
  pendingInvites: 0,
  processReviewed: false,
  hasJob: false,
};

describe("work onboarding", () => {
  it("gives org admins the setup, hiring managers their own welcome, everyone else the short one", () => {
    expect(onboardingKind("leadership", true)).toBe("admin");
    expect(onboardingKind("recruiter", true)).toBe("admin");
    expect(onboardingKind("recruiter", false)).toBe("user");
    expect(onboardingKind("leadership", false)).toBe("user");
    expect(onboardingKind("hiring_manager", false)).toBe("hm");
  });

  it("stops once the matching hint is recorded", () => {
    expect(needsOnboarding("admin", [])).toBe(true);
    expect(needsOnboarding("admin", [ONBOARDING_HINTS.welcome])).toBe(true);
    expect(needsOnboarding("admin", [ONBOARDING_HINTS.adminSetup])).toBe(false);
    expect(needsOnboarding("user", [ONBOARDING_HINTS.welcome])).toBe(false);
    expect(needsOnboarding("hm", [ONBOARDING_HINTS.welcome])).toBe(false);
  });

  it("only takes over the home screens, never a job opened directly", () => {
    expect(isOnboardingEntry("/work")).toBe(true);
    expect(isOnboardingEntry("/work/hm")).toBe(true);
    expect(isOnboardingEntry("/work/jobs/abc")).toBe(false);
    expect(isOnboardingEntry("/work/welcome")).toBe(false);
  });

  it("opens a new admin on the calendar step", () => {
    expect(currentStep(adminSteps(fresh))?.key).toBe("calendar");
  });

  it("moves to the next step that isn't done, in any order", () => {
    const steps = adminSteps({ ...fresh, calendarConnected: true, hasJob: true });
    expect(currentStep(steps)?.key).toBe("team");
  });

  it("counts a pending invite as inviting the team", () => {
    const team = adminSteps({ ...fresh, pendingInvites: 2 }).find((s) => s.key === "team")!;
    expect(team.done).toBe(true);
    expect(team.doneLine).toBe("2 people invited");
  });

  it("is complete when every step is done", () => {
    expect(
      currentStep(
        adminSteps({
          calendarConnected: true,
          teamSize: 3,
          pendingInvites: 0,
          processReviewed: true,
          hasJob: true,
        }),
      ),
    ).toBeNull();
  });

  it("lets hiring managers open the welcome screen", () => {
    expect(resolveDashboardRouteAccessRule("/work/welcome")?.roles).toContain("hiring_manager");
    expect(resolveDashboardRouteAccessRule("/work")?.roles).not.toContain("hiring_manager");
  });
});
