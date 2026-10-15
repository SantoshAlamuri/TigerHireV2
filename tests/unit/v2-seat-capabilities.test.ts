import { describe, it, expect } from "vitest";
import { capabilitiesFor, canEdit, type Seat } from "@/lib/v2/seat-capabilities";
import { NAV_REGISTRY } from "@/lib/navigation/registry";
import type { UserRole } from "@/types/database";

/**
 * Seats are hats, not headcount — in a one-person HR company the same login is
 * recruiter and head of talent. What changes per seat is what you can see and
 * what you can change, never which URLs happen to exist.
 *
 * The rule everywhere: show what you control, and let you edit only that.
 */
describe("capabilitiesFor", () => {
  it("gives a recruiter the full hiring surface", () => {
    const c = capabilitiesFor("recruiter");
    expect(c.viewJobs).toBe(true);
    expect(c.reviewApplications).toBe(true);
    expect(c.editJobSetup).toBe(true);
    expect(c.viewAnalytics).toBe(true);
  });

  it("lets leadership do everything a recruiter can, plus org integrations", () => {
    const c = capabilitiesFor("leadership");
    expect(c.editIntegrations).toBe(true);
    expect(c.reviewApplications).toBe(true);
  });

  it("does not let a recruiter change org integrations", () => {
    // Recruiters can see whether WhatsApp is up; rotating keys is not their job.
    const c = capabilitiesFor("recruiter");
    expect(c.viewIntegrations).toBe(true);
    expect(c.editIntegrations).toBe(false);
  });

  it("keeps a hiring manager to their own decisions", () => {
    const c = capabilitiesFor("hiring_manager");
    expect(c.viewJobs).toBe(true);
    expect(c.submitFeedback).toBe(true);
    // Triage, setup and org config are not theirs.
    expect(c.reviewApplications).toBe(false);
    expect(c.editJobSetup).toBe(false);
    expect(c.viewIntegrations).toBe(false);
  });

  it("keeps an agency to submissions only", () => {
    const c = capabilitiesFor("agency");
    expect(c.submitCandidates).toBe(true);
    expect(c.viewOwnSubmissions).toBe(true);
    // Never other people's candidates, never the org's numbers.
    expect(c.viewAllCandidates).toBe(false);
    expect(c.viewAnalytics).toBe(false);
    expect(c.reviewApplications).toBe(false);
  });

  it("treats an unknown or missing seat as the most restricted", () => {
    for (const seat of [undefined, null, "wat" as unknown as Seat]) {
      const c = capabilitiesFor(seat as Seat | null | undefined);
      expect(c.viewJobs).toBe(false);
      expect(c.editJobSetup).toBe(false);
      expect(c.editIntegrations).toBe(false);
    }
  });
});

/**
 * The rail these capabilities used to draw is gone — it was a second navigation
 * stacked under the shell's own, duplicating Jobs, Candidates and Analytics.
 * What survives is the decision it encoded: which seat is offered Portfolio,
 * Governance and Hiring setup. That now happens in NAV_REGISTRY, so this
 * asserts it there — on what actually renders, not on a parallel list.
 */
describe("v2 destinations in the one navigation", () => {
  const labelsFor = (role: string, isOrgAdmin = false) =>
    NAV_REGISTRY.filter((e) =>
      e.visibleTo({ role: role as UserRole, is_org_admin: isOrgAdmin }),
    ).map((e) => e.label);

  it("offers a recruiter the portfolio and hiring setup", () => {
    // Portfolio, not Governance: a recruiter reads the rollup of their own
    // work, but signing off on the bar they built is a rubber stamp.
    const labels = labelsFor("recruiter");
    expect(labels).toContain("Portfolio");
    expect(labels).toContain("Hiring setup");
  });

  it("gives leadership the sign-off queue that a recruiter does not get", () => {
    // Seats are hats: in a one-person HR company this login wears both, and
    // what leadership adds is the signature.
    expect(labelsFor("leadership")).toContain("Governance");
    expect(labelsFor("recruiter")).not.toContain("Governance");
  });

  it("offers a hiring manager none of the three — they cannot open any of them", () => {
    // viewPortfolio / approveRubrics / editJobSetup are all false for this
    // seat, and SeatGate turns them away at the page. A link that leads to a
    // "you do not have access" panel is worse than no link.
    const labels = labelsFor("hiring_manager");
    for (const l of ["Portfolio", "Governance", "Hiring setup"]) expect(labels).not.toContain(l);
  });

  it("offers an agency none of them either", () => {
    const labels = labelsFor("agency");
    for (const l of ["Portfolio", "Governance", "Hiring setup"]) expect(labels).not.toContain(l);
  });

  it("keeps every v2 destination under /recruit", () => {
    for (const id of ["jobs.portfolio", "jobs.governance", "jobs.hiring_setup"]) {
      const entry = NAV_REGISTRY.find((e) => e.id === id);
      expect(entry?.path?.startsWith("/recruit/")).toBe(true);
    }
  });
});

describe("canEdit", () => {
  it("permits edits only where the seat owns the thing", () => {
    expect(canEdit("recruiter", "jobSetup")).toBe(true);
    expect(canEdit("hiring_manager", "jobSetup")).toBe(false);
    expect(canEdit("leadership", "integrations")).toBe(true);
    expect(canEdit("recruiter", "integrations")).toBe(false);
    expect(canEdit("agency", "jobSetup")).toBe(false);
  });

  it("refuses an unknown seat everything", () => {
    expect(canEdit(undefined, "jobSetup")).toBe(false);
    expect(canEdit(undefined, "integrations")).toBe(false);
  });
});
