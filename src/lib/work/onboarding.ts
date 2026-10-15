/**
 * Onboarding for the work-driven UI.
 *
 * Two shapes:
 * - An org admin gets a short setup checklist. Every step is checked against
 *   real data, so it ticks itself off; the page opens on the first step that
 *   is not done yet, the same way a job opens on the step that needs you.
 * - Everyone else gets a three-screen welcome (two for hiring managers) that
 *   explains how work reaches them, then gets out of the way.
 *
 * Whether someone has finished is kept in profiles.dismissed_hints.
 */
import type { UserRole } from "@/types/database";

export const ONBOARDING_HINTS = {
  /** Non-admin welcome seen. */
  welcome: "work_welcome",
  /** Admin finished or skipped setup. */
  adminSetup: "work_admin_setup",
  /** Admin looked at the hiring process defaults and kept them. */
  processReviewed: "work_process_reviewed",
} as const;

export type OnboardingKind = "admin" | "user" | "hm";

export function onboardingKind(role: UserRole, isOrgAdmin: boolean): OnboardingKind {
  if (role === "hiring_manager") return "hm";
  return isOrgAdmin ? "admin" : "user";
}

/** True when this person still has onboarding to see. */
export function needsOnboarding(kind: OnboardingKind, hints: readonly string[]): boolean {
  return !hints.includes(kind === "admin" ? ONBOARDING_HINTS.adminSetup : ONBOARDING_HINTS.welcome);
}

/** Where onboarding takes over: only the two home screens, never a job someone opened directly. */
export function isOnboardingEntry(pathname: string): boolean {
  return pathname === "/work" || pathname === "/work/hm";
}

export interface AdminFacts {
  calendarConnected: boolean;
  /** Active members including the admin. */
  teamSize: number;
  pendingInvites: number;
  processReviewed: boolean;
  hasJob: boolean;
}

export type SetupStepKey = "calendar" | "team" | "process" | "job";

export interface SetupLink {
  name: string;
  href: string;
}

export interface SetupStep {
  key: SetupStepKey;
  title: string;
  why: string;
  done: boolean;
  /** Shown once done. */
  doneLine: string;
  links: SetupLink[];
}

export function adminSteps(f: AdminFacts): SetupStep[] {
  const invited = f.teamSize - 1 + f.pendingInvites;
  return [
    {
      key: "calendar",
      title: "Connect your calendar",
      why: "Interviews book themselves into your real free time.",
      done: f.calendarConnected,
      doneLine: "Calendar connected",
      links: [{ name: "Connect Google or Microsoft", href: "/work/setup/calendar?from=welcome" }],
    },
    {
      key: "team",
      title: "Invite your team",
      why: "Recruiters run jobs. Hiring managers only see the decisions that are theirs.",
      done: invited > 0,
      doneLine: invited === 1 ? "1 person invited" : `${invited} people invited`,
      links: [{ name: "Invite people", href: "/work/setup/team?from=welcome" }],
    },
    {
      key: "process",
      title: "Check your hiring process",
      why: "Interview stages, and who approves new roles and offers. The defaults work; change them only if yours differ.",
      done: f.processReviewed,
      doneLine: "Hiring process checked",
      links: [{ name: "See stages and approvals", href: "/work/setup/process?from=welcome" }],
    },
    {
      key: "job",
      title: "Start your first job",
      why: "A few lines about the role. The agent drafts the rest and brings it back to you.",
      done: f.hasJob,
      doneLine: "First job started",
      links: [{ name: "Start a job", href: "/work/new" }],
    },
  ];
}

/** The step the page should open on, or null when setup is complete. */
export function currentStep(steps: SetupStep[]): SetupStep | null {
  return steps.find((s) => !s.done) ?? null;
}
