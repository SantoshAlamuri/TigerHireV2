import type { UserRole } from "@/types/database";

/** Org-wide interviews calendar — superseded by Brief 12 `/calendar`. */
export const COMPANY_INTERVIEWS_HREF = "/company/interviews";

/** Roles that use Brief 12 simplified top nav when plan document is on. */
export const PLAN_DOCUMENT_SIMPLIFIED_NAV_ROLES: UserRole[] = [
  "leadership",
  "recruiter",
  "hiring_manager",
];

export const PLAN_DOCUMENT_ORG_INTERVIEWS_NAV_ROLES: UserRole[] = [
  ...PLAN_DOCUMENT_SIMPLIFIED_NAV_ROLES,
];

/** Top-nav hrefs hidden in Brief 12 plan-document mode (recruiter / leadership / HM). */
export const PLAN_DOCUMENT_HIDDEN_TOP_NAV_HREFS: readonly string[] = [
  COMPANY_INTERVIEWS_HREF,
  "/company/approvals",
  "/company/offers/draft",
] as const;

/** Sidebar registry entry ids hidden in Brief 12 plan-document mode. */
export const PLAN_DOCUMENT_HIDDEN_SIDEBAR_ENTRY_IDS = [
  "interviews",
  "interviews.calendar",
  "interviews.prep",
  "interviews.my_availability",
  "jobs.approvals",
  "jobs.offers_draft",
  "analytics.saved_searches",
] as const;

export const PLAN_DOCUMENT_CALENDAR_HREF = "/calendar";
export const PLAN_DOCUMENT_TASKS_HREF = "/tasks";

/** Legacy route → destination when plan document (Brief 12) is on. */
export const PLAN_DOCUMENT_LEGACY_REDIRECTS: Readonly<
  Record<string, { to: string; message: string }>
> = {
  "/company/analytics": {
    to: "/recruit/analytics",
    message: "Analytics live under Recruit → Analytics.",
  },
};

/** True when plan-first job workspace is enabled (server or client env). */
export function isPlanDocumentNavActive(): boolean {
  return (
    process.env.FF_PLAN_DOCUMENT === "true" || process.env.NEXT_PUBLIC_FF_PLAN_DOCUMENT === "true"
  );
}

export function usesPlanDocumentSimplifiedNav(role: UserRole): boolean {
  return isPlanDocumentNavActive() && PLAN_DOCUMENT_SIMPLIFIED_NAV_ROLES.includes(role);
}

export function shouldHideOrgInterviewsNavForRole(role: UserRole): boolean {
  return usesPlanDocumentSimplifiedNav(role);
}

export function isNavHrefHiddenInPlanDocumentMode(role: UserRole, href: string): boolean {
  if (!usesPlanDocumentSimplifiedNav(role)) return false;
  return (PLAN_DOCUMENT_HIDDEN_TOP_NAV_HREFS as readonly string[]).includes(href);
}

export function isSidebarEntryIdHiddenInPlanDocumentMode(role: UserRole, entryId: string): boolean {
  if (!usesPlanDocumentSimplifiedNav(role)) return false;
  return (PLAN_DOCUMENT_HIDDEN_SIDEBAR_ENTRY_IDS as readonly string[]).includes(entryId);
}

export function getPlanDocumentOmittedSidebarEntryIds(role: UserRole): string[] {
  if (!usesPlanDocumentSimplifiedNav(role)) return [];
  return [...PLAN_DOCUMENT_HIDDEN_SIDEBAR_ENTRY_IDS];
}

export function getPlanDocumentLegacyRedirect(
  pathname: string,
): { to: string; message: string } | null {
  if (!isPlanDocumentNavActive()) return null;
  const normalized = pathname.split("?")[0]?.replace(/\/$/, "") || pathname;
  return PLAN_DOCUMENT_LEGACY_REDIRECTS[normalized] ?? null;
}
