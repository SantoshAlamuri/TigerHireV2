import type { UserRole } from "@/types/database";
import {
  COMPANY_INTERVIEWS_HREF,
  isNavHrefHiddenInPlanDocumentMode,
  isPlanDocumentNavActive,
  PLAN_DOCUMENT_CALENDAR_HREF,
  usesPlanDocumentSimplifiedNav,
} from "@/lib/navigation/plan-document-nav-filter";

export { COMPANY_INTERVIEWS_HREF, isPlanDocumentNavActive };

/**
 * Where "Analytics" goes in the primary nav.
 *
 * Analytics lives on its canonical route. The redesign briefly sat at
 * /recruit/v2/analytics, and that parallel prefix is what produced a
 * half-migrated nav and a route policy that locked hiring managers out of their
 * own seat. Converging the screen onto /recruit/analytics removes both classes
 * of bug rather than papering over them. Still one constant: the destination
 * appearing in six role lists is how a migration ships half-done.
 */
export const ANALYTICS_HREF = "/recruit/analytics";

/** Brief 12 top nav when `FF_PLAN_DOCUMENT` is on. */
const PLAN_DOCUMENT_PRIMARY_NAV_BY_ROLE: Partial<Record<UserRole, string[]>> = {
  leadership: [
    "/company",
    "/recruit/jobs",
    "/recruit/candidates",
    "/recruit/pipeline",
    PLAN_DOCUMENT_CALENDAR_HREF,
    "/tasks",
    ANALYTICS_HREF,
    "/company/referrals",
  ],
  recruiter: [
    "/recruit/jobs",
    "/recruit/candidates",
    "/recruit/pipeline",
    PLAN_DOCUMENT_CALENDAR_HREF,
    "/tasks",
    ANALYTICS_HREF,
    "/company/referrals",
  ],
  hiring_manager: [
    "/company/my-jobs",
    "/company/my-pipeline",
    PLAN_DOCUMENT_CALENDAR_HREF,
    "/tasks",
    ANALYTICS_HREF,
  ],
};

/**
 * Top-nav hrefs for a role, respecting plan-document mode.
 * When `FF_PLAN_DOCUMENT` is on, recruiter/leadership/HM use Brief 12 simplified nav.
 */
export function getPrimaryNavHrefsForRole(role: UserRole): string[] {
  if (usesPlanDocumentSimplifiedNav(role)) {
    return PLAN_DOCUMENT_PRIMARY_NAV_BY_ROLE[role] ?? [];
  }
  const base = PRIMARY_NAV_BY_ROLE[role] ?? [];
  return base.filter((href) => !isNavHrefHiddenInPlanDocumentMode(role, href));
}

/** Bookmarked `/company/interviews` redirect when plan document is on (interviewer keeps the page). */
export function getCompanyInterviewsRedirectForRole(role: UserRole): string | null {
  if (!isPlanDocumentNavActive()) return null;
  if (role === "interviewer") return null;
  if (usesPlanDocumentSimplifiedNav(role)) {
    return PLAN_DOCUMENT_CALENDAR_HREF;
  }
  switch (role) {
    case "recruiter":
      return "/recruit/jobs";
    case "leadership":
      return "/recruit/jobs";
    case "hiring_manager":
      return "/company/my-jobs";
    default:
      return "/recruit/jobs";
  }
}

/** Top-nav tab order per role (paths must resolve via NAV_REGISTRY for customer-shell roles). */
export const PRIMARY_NAV_BY_ROLE: Partial<Record<UserRole, string[]>> = {
  super_admin: [
    "/admin",
    "/admin/onboarding-requests",
    "/admin/organisations",
    "/admin/billing",
    "/admin/costs",
    "/admin/support-requests",
  ],
  leadership: [
    "/company",
    "/recruit/jobs",
    "/recruit/candidates",
    "/recruit/pipeline",
    "/company/interviews",
    "/recruit/assessments",
    "/tasks",
    "/company/offers",
    ANALYTICS_HREF,
    "/company/referrals",
  ],
  recruiter: [
    "/recruit/jobs",
    "/recruit/candidates",
    "/recruit/pipeline",
    "/company/interviews",
    "/recruit/assessments",
    "/tasks",
    "/company/offers",
    ANALYTICS_HREF,
    "/company/referrals",
  ],
  hiring_manager: [
    "/company/my-jobs",
    "/company/my-pipeline",
    "/company/hiring-requests",
    "/tasks",
    "/company/offers",
    ANALYTICS_HREF,
    "/company/interviews",
  ],
  interviewer: ["/home", "/company/interviews"],
  finance: ["/home", "/company/finance"],
  agency: ["/agency", "/agency/clients", "/agency/jobs", "/agency/pipeline"],
  employee: ["/employee"],
  candidate_pro: [
    "/candidate",
    "/candidate/applications",
    "/candidate/jobs",
    "/dashboard/referrer",
  ],
  candidate_free: [
    "/candidate",
    "/candidate/applications",
    "/candidate/jobs",
    "/dashboard/referrer",
  ],
};
