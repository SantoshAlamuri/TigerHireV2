import { afterEach, describe, expect, it, vi } from "vitest";
import { composeSidebarGroupsForRole } from "@/lib/navigation/compose-sidebar-groups";
import {
  getPlanDocumentOmittedSidebarEntryIds,
  PLAN_DOCUMENT_HIDDEN_SIDEBAR_ENTRY_IDS,
} from "@/lib/navigation/plan-document-nav-filter";
import {
  PLAN_DOCUMENT_CALENDAR_HREF,
  PLAN_DOCUMENT_TASKS_HREF,
} from "@/lib/navigation/plan-document-nav-filter";
import {
  COMPANY_INTERVIEWS_HREF,
  getCompanyInterviewsRedirectForRole,
  getPrimaryNavHrefsForRole,
  PRIMARY_NAV_BY_ROLE,
} from "@/lib/navigation/primary-nav-by-role";
import type { NavUser } from "@/lib/navigation/registry";

const resolverUser: NavUser = { role: "hiring_manager", is_org_admin: false };

function sidebarLabels(role: "recruiter" | "leadership" | "hiring_manager") {
  return composeSidebarGroupsForRole({ role, user: { ...resolverUser, role } })
    .flatMap((g) => g.items)
    .map((i) => i.label);
}

describe("plan document nav (Brief 11)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("leaves recruiter top nav unchanged when flag is off", () => {
    vi.stubEnv("FF_PLAN_DOCUMENT", "false");
    vi.stubEnv("NEXT_PUBLIC_FF_PLAN_DOCUMENT", "false");
    expect(getPrimaryNavHrefsForRole("recruiter")).toEqual(PRIMARY_NAV_BY_ROLE.recruiter);
    expect(getPrimaryNavHrefsForRole("recruiter")).toContain(COMPANY_INTERVIEWS_HREF);
  });

  it("removes Interviews from recruiter, leadership, and HM top nav when flag is on", () => {
    vi.stubEnv("FF_PLAN_DOCUMENT", "true");
    expect(getPrimaryNavHrefsForRole("recruiter")).not.toContain(COMPANY_INTERVIEWS_HREF);
    expect(getPrimaryNavHrefsForRole("leadership")).not.toContain(COMPANY_INTERVIEWS_HREF);
    expect(getPrimaryNavHrefsForRole("hiring_manager")).not.toContain(COMPANY_INTERVIEWS_HREF);
  });

  it.each(["true", "false"])("keeps leadership Overview available with plan flag %s", (flag) => {
    vi.stubEnv("FF_PLAN_DOCUMENT", flag);
    vi.stubEnv("NEXT_PUBLIC_FF_PLAN_DOCUMENT", flag);
    expect(getPrimaryNavHrefsForRole("leadership")[0]).toBe("/company");
  });

  it("uses Brief 12 simplified top nav for recruiter, leadership, and HM when flag is on", () => {
    vi.stubEnv("FF_PLAN_DOCUMENT", "true");
    expect(getPrimaryNavHrefsForRole("recruiter")).toEqual([
      "/recruit/jobs",
      "/recruit/candidates",
      "/recruit/pipeline",
      PLAN_DOCUMENT_CALENDAR_HREF,
      PLAN_DOCUMENT_TASKS_HREF,
      "/recruit/analytics",
      "/company/referrals",
    ]);
    expect(getPrimaryNavHrefsForRole("leadership")).toContain("/recruit/analytics");
    expect(getPrimaryNavHrefsForRole("hiring_manager")).toEqual([
      "/company/my-jobs",
      "/company/my-pipeline",
      PLAN_DOCUMENT_CALENDAR_HREF,
      PLAN_DOCUMENT_TASKS_HREF,
      "/recruit/analytics",
    ]);
  });

  it("keeps Interviews in interviewer top nav when flag is on", () => {
    vi.stubEnv("FF_PLAN_DOCUMENT", "true");
    expect(getPrimaryNavHrefsForRole("interviewer")).toContain(COMPANY_INTERVIEWS_HREF);
  });

  it("redirects recruiter bookmarks away from /company/interviews when flag is on", () => {
    vi.stubEnv("FF_PLAN_DOCUMENT", "true");
    expect(getCompanyInterviewsRedirectForRole("recruiter")).toBe(PLAN_DOCUMENT_CALENDAR_HREF);
    expect(getCompanyInterviewsRedirectForRole("interviewer")).toBeNull();
  });

  it("omits interviews sidebar entry ids for recruiter, leadership, and HM when flag is on", () => {
    vi.stubEnv("FF_PLAN_DOCUMENT", "true");
    for (const role of ["recruiter", "leadership", "hiring_manager"] as const) {
      expect(getPlanDocumentOmittedSidebarEntryIds(role)).toEqual([
        ...PLAN_DOCUMENT_HIDDEN_SIDEBAR_ENTRY_IDS,
      ]);
    }
    expect(getPlanDocumentOmittedSidebarEntryIds("interviewer")).toEqual([]);
  });

  it("removes Interviews, Interview prep, and My availability from HM sidebar when flag is on", () => {
    vi.stubEnv("FF_PLAN_DOCUMENT", "true");
    const labels = sidebarLabels("hiring_manager");
    expect(labels).not.toContain("Interviews");
    expect(labels).not.toContain("Interview prep");
    expect(labels).not.toContain("My availability");
    expect(labels).toContain("Pipeline");
  });

  it("shows Analytics in leadership sidebar when flag is on", () => {
    vi.stubEnv("FF_PLAN_DOCUMENT", "true");
    expect(sidebarLabels("leadership")).toContain("Analytics");
  });

  it("keeps Interviews in interviewer sidebar when flag is on", () => {
    vi.stubEnv("FF_PLAN_DOCUMENT", "true");
    const labels = composeSidebarGroupsForRole({
      role: "interviewer",
      user: { role: "interviewer", is_org_admin: false },
    })
      .flatMap((g) => g.items)
      .map((i) => i.label);
    expect(labels).toContain("Interviews");
  });
});
