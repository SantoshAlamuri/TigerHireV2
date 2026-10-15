import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveDashboardRouteAccessRule } from "@/lib/security/dashboard-route-policy";
import {
  getPlanDocumentLegacyRedirect,
  isNavHrefHiddenInPlanDocumentMode,
  isSidebarEntryIdHiddenInPlanDocumentMode,
} from "@/lib/navigation/plan-document-nav-filter";

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

afterEach(() => vi.unstubAllEnvs());

describe("consolidated workspace bookmarks", () => {
  it.each([
    ["company/jobs/new", "/company/hiring-requests/new"],
    ["recruit/jobs/new", "/company/hiring-requests/new"],
    ["company/assessments", "/recruit/assessments"],
    ["company/interview-prep", "/recruit/interview-prep"],
    ["recruit/offers", "/company/offers"],
    ["recruit/offers/draft", "/company/offers/draft"],
  ])("redirects %s directly with all bookmarked context", async (legacy, target) => {
    const pages = {
      "recruit/offers": () => import("@/app/(dashboard)/recruit/offers/page"),
      "recruit/offers/draft": () => import("@/app/(dashboard)/recruit/offers/draft/page"),
      "company/jobs/new": () => import("@/app/(dashboard)/company/jobs/new/page"),
      "recruit/jobs/new": () => import("@/app/(dashboard)/recruit/jobs/new/page"),
      "company/assessments": () => import("@/app/(dashboard)/company/assessments/page"),
      "company/interview-prep": () => import("@/app/(dashboard)/company/interview-prep/page"),
    };
    const { default: Page } = await pages[legacy as keyof typeof pages]();
    await expect(
      Page({
        searchParams: Promise.resolve({
          focus: "submitted",
          pipelineCandidateId: "candidate & 1",
          tag: ["one", "two"],
          missing: undefined,
        }),
      }),
    ).rejects.toThrow(
      `redirect:${target}?focus=submitted&pipelineCandidateId=candidate+%26+1&tag=one&tag=two`,
    );
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(`redirect:${target}`);
  });

  it("preserves requisition identity and filters on its alias", async () => {
    const { default: Page } = await import("@/app/(dashboard)/company/hiring-requests/[id]/page");
    await expect(
      Page({
        params: Promise.resolve({ id: "req-1" }),
        searchParams: Promise.resolve({ tab: "approval", source: "pending" }),
      }),
    ).rejects.toThrow("redirect:/recruit/hiring-requests/req-1?tab=approval&source=pending");
    const sourceRoles = resolveDashboardRouteAccessRule("/company/hiring-requests/req-1")!.roles;
    const targetRoles = resolveDashboardRouteAccessRule("/recruit/hiring-requests/req-1")!.roles;
    for (const role of sourceRoles) expect(targetRoles).toContain(role);
  });

  it.each(["/offers", "/offers/draft"])(
    "preserves former recruiter-route roles at canonical %s",
    (suffix) => {
      const sourceRoles = resolveDashboardRouteAccessRule(`/recruit${suffix}`)!.roles;
      const targetRoles = resolveDashboardRouteAccessRule(`/company${suffix}`)!.roles;
      for (const role of sourceRoles) expect(targetRoles).toContain(role);
      expect(targetRoles).not.toContain("agency");
      expect(targetRoles).not.toContain("candidate_free");
      expect(resolveDashboardRouteAccessRule("/company")!.roles).not.toContain("super_admin");
    },
  );

  it("keeps the specialized approvals inbox and its source filters in plan mode", () => {
    vi.stubEnv("FF_PLAN_DOCUMENT", "true");
    expect(getPlanDocumentLegacyRedirect("/company/approvals?filter=hiring_request")).toBeNull();
    expect(resolveDashboardRouteAccessRule("/company/approvals")!.roles).toContain("leadership");
  });

  it("does not replace offer oversight with Jobs in plan mode", () => {
    vi.stubEnv("FF_PLAN_DOCUMENT", "true");
    expect(getPlanDocumentLegacyRedirect("/company/offers")).toBeNull();
    for (const role of ["leadership", "recruiter", "hiring_manager"] as const) {
      expect(isNavHrefHiddenInPlanDocumentMode(role, "/company/offers")).toBe(false);
      expect(isSidebarEntryIdHiddenInPlanDocumentMode(role, "jobs.offers")).toBe(false);
      expect(resolveDashboardRouteAccessRule("/company/offers")!.roles).toContain(role);
    }
  });

  it.each(["assessments", "interview-prep"])(
    "retains company roles on canonical %s without opening all recruiter pages",
    (workspace) => {
      const legacyRoles = resolveDashboardRouteAccessRule(`/company/${workspace}`)!.roles;
      const canonicalRoles = resolveDashboardRouteAccessRule(`/recruit/${workspace}`)!.roles;
      for (const role of legacyRoles) expect(canonicalRoles).toContain(role);
      expect(canonicalRoles).not.toContain("candidate_free");
      expect(canonicalRoles).not.toContain("agency");
      expect(resolveDashboardRouteAccessRule("/recruit/jobs")!.roles).not.toContain("interviewer");
    },
  );

  it("keeps assessments reachable when the plan workspace flag is on", () => {
    vi.stubEnv("FF_PLAN_DOCUMENT", "true");
    vi.stubEnv("NEXT_PUBLIC_FF_PLAN_DOCUMENT", "true");
    expect(getPlanDocumentLegacyRedirect("/company/assessments")).toBeNull();
    for (const role of ["leadership", "recruiter", "hiring_manager"] as const) {
      expect(isNavHrefHiddenInPlanDocumentMode(role, "/recruit/assessments")).toBe(false);
      expect(isSidebarEntryIdHiddenInPlanDocumentMode(role, "jobs.assessments")).toBe(false);
    }
  });

  it("redirects the v2 job setup bookmark to the canonical setup workspace", async () => {
    const { default: Page } = await import("@/app/(dashboard)/recruit/v2/jobs/[id]/setup/page");
    await expect(Page({ params: Promise.resolve({ id: "job-1" }) })).rejects.toThrow(
      "redirect:/recruit/jobs/job-1/setup",
    );
    const sourceRoles = resolveDashboardRouteAccessRule("/recruit/v2/jobs/job-1/setup")!.roles;
    const targetRoles = resolveDashboardRouteAccessRule("/recruit/jobs/job-1/setup")!.roles;
    for (const role of ["recruiter", "leadership", "hiring_manager"] as const) {
      expect(sourceRoles).toContain(role);
      expect(targetRoles).toContain(role);
    }
  });
});
