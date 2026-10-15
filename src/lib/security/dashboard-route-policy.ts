import { USER_ROLES, type UserRole } from "@/types/database";

/** Every authenticated product role (same as `USER_ROLES`). */
const ALL_PRODUCT_ROLES: UserRole[] = [...USER_ROLES];

/** Hiring-config settings pages recruiters may open without `is_org_admin` (Brief 3 Phase 2). */
export const COMPANY_HIRING_CONFIG_SETTINGS_PREFIXES: readonly string[] = [
  "/company/settings/pipeline",
  "/company/settings/screening",
  "/company/settings/offer-letter-templates",
  "/company/settings/compensation-bands",
  "/company/settings/offer-approval-workflow",
  "/company/settings/requisition-approval-workflow",
  "/company/settings/requisition-templates",
  "/company/settings/requisition-delegations",
  // The templates hub is where requisition- and offer-letter-templates actually
  // live; both of those are recruiter-accessible above, but each is only a
  // redirect stub pointing here. Without this entry a recruiter opening their own
  // templates was bounced to /recruit/jobs, or hit a bare 403.
  "/company/settings/templates",
] as const;

const HIRING_CONFIG_SETTINGS_ROLES: readonly UserRole[] = [
  "leadership",
  "recruiter",
  "super_admin",
];

/** Roles that may use org-wide company settings when `profiles.is_org_admin` is true (Brief 1). */
const ORG_SETTINGS_ELIGIBLE_ROLES: readonly UserRole[] = [
  "leadership",
  "recruiter",
  "hiring_manager",
  "interviewer",
  "finance",
  "employee",
];

/**
 * Company paths that require `is_org_admin` in addition to role allow-list (middleware).
 * Longest prefix first where overlap matters.
 */
export const DASHBOARD_ORG_ADMIN_SETUP_PREFIXES: readonly string[] = [
  "/company/settings",
  "/company/team",
  "/company/pending-resignations",
  "/company/billing",
];

export function matchesOrgAdminSetupPrefix(pathname: string): boolean {
  return DASHBOARD_ORG_ADMIN_SETUP_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function isCompanyHiringConfigSettingsPath(pathname: string): boolean {
  return COMPANY_HIRING_CONFIG_SETTINGS_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Org-wide company config (settings, team, billing, etc.) — redirect non–org-admins to home.
 * TigerHire `super_admin` may open `/company/billing` without the org-admin flag.
 */
export function shouldRedirectNonOrgAdminFromOrgConfigPath(
  pathname: string,
  isOrgAdmin: boolean,
  role: UserRole,
): boolean {
  if (isOrgAdmin) return false;
  if (
    role === "super_admin" &&
    (pathname === "/company/billing" || pathname.startsWith("/company/billing/"))
  ) {
    return false;
  }
  if (
    isCompanyHiringConfigSettingsPath(pathname) &&
    (HIRING_CONFIG_SETTINGS_ROLES as readonly string[]).includes(role)
  ) {
    return false;
  }
  return matchesOrgAdminSetupPrefix(pathname);
}

/** Setup mode (Brief 1) — gated by `is_org_admin` only after role allow-list. */
export function matchesSetupPrefix(pathname: string): boolean {
  return pathname === "/setup" || pathname.startsWith("/setup/");
}

/**
 * Path-prefix → allowed roles for dashboard UI and edge middleware.
 *
 * Order matters: `find((r) => pathname.startsWith(r.prefix))` uses the **first**
 * matching prefix, so more specific paths (e.g. `/company/settings/offer-letter-templates`)
 * must appear before shorter ones (`/company/settings`, `/company`).
 */
export const DASHBOARD_ROUTE_ACCESS_RULES: ReadonlyArray<{
  prefix: string;
  roles: readonly UserRole[];
}> = [
  { prefix: "/admin", roles: ["super_admin"] },
  {
    prefix: "/home",
    roles: ["leadership", "hiring_manager", "recruiter", "finance", "interviewer", "employee"],
  },
  {
    prefix: "/calendar",
    roles: ["leadership", "hiring_manager", "recruiter", "super_admin"],
  },
  {
    prefix: "/tasks",
    roles: ["leadership", "hiring_manager", "recruiter", "super_admin"],
  },
  {
    prefix: "/setup",
    roles: ["leadership", "hiring_manager", "recruiter", "finance", "interviewer", "employee"],
  },
  {
    prefix: "/company/pending-activation",
    roles: ["leadership", "hiring_manager", "recruiter", "finance", "interviewer", "employee"],
  },
  {
    prefix: "/company/pending-resignations",
    roles: [...ORG_SETTINGS_ELIGIBLE_ROLES],
  },
  { prefix: "/company/team", roles: [...ORG_SETTINGS_ELIGIBLE_ROLES] },
  { prefix: "/company/billing", roles: [...ORG_SETTINGS_ELIGIBLE_ROLES, "super_admin"] },
  {
    prefix: "/company/settings/requisition-delegations",
    roles: [...HIRING_CONFIG_SETTINGS_ROLES],
  },
  {
    prefix: "/company/settings/requisition-templates",
    roles: [...HIRING_CONFIG_SETTINGS_ROLES],
  },
  {
    prefix: "/company/settings/requisition-approval-workflow",
    roles: [...HIRING_CONFIG_SETTINGS_ROLES],
  },
  {
    prefix: "/company/settings/offer-approval-workflow",
    roles: [...HIRING_CONFIG_SETTINGS_ROLES],
  },
  {
    prefix: "/company/settings/compensation-bands",
    roles: [...HIRING_CONFIG_SETTINGS_ROLES],
  },
  {
    prefix: "/company/settings/offer-letter-templates",
    roles: [...HIRING_CONFIG_SETTINGS_ROLES],
  },
  { prefix: "/company/settings/screening", roles: [...HIRING_CONFIG_SETTINGS_ROLES] },
  { prefix: "/company/settings/pipeline", roles: [...HIRING_CONFIG_SETTINGS_ROLES] },
  { prefix: "/company/settings", roles: [...ORG_SETTINGS_ELIGIBLE_ROLES] },
  { prefix: "/company/interview-prep", roles: ["interviewer", "leadership", "hiring_manager"] },
  {
    prefix: "/company/interviews",
    roles: ["interviewer", "leadership", "hiring_manager", "recruiter", "super_admin"],
  },
  {
    prefix: "/company/my-availability",
    roles: ["interviewer", "leadership", "hiring_manager", "recruiter", "super_admin"],
  },
  {
    prefix: "/recruit/my-availability",
    roles: ["recruiter", "leadership", "super_admin"],
  },
  { prefix: "/company/finance", roles: ["finance", "leadership", "super_admin"] },
  /** Pipeline approvals UI — API allows recruiter + leadership; must be before `/company` catch-all. */
  {
    prefix: "/company/approvals",
    roles: ["hiring_manager", "leadership", "recruiter", "super_admin"],
  },
  /** Hiring manager: scoped pages only (not org-wide `/company` overview). */
  { prefix: "/company/my-jobs", roles: ["leadership", "hiring_manager"] },
  { prefix: "/company/my-pipeline", roles: ["leadership", "hiring_manager"] },
  { prefix: "/company/my-settings", roles: ["leadership", "hiring_manager"] },
  {
    prefix: "/company/hiring-requests",
    roles: ["leadership", "hiring_manager", "recruiter", "super_admin"],
  },
  {
    prefix: "/company/offers/draft",
    roles: ["leadership", "hiring_manager", "recruiter", "super_admin"],
  },
  {
    prefix: "/company/offers",
    roles: ["leadership", "hiring_manager", "recruiter", "super_admin"],
  },
  {
    prefix: "/company/assessments",
    roles: ["leadership", "hiring_manager", "interviewer", "recruiter"],
  },
  { prefix: "/company/jobs", roles: ["leadership", "hiring_manager"] },
  /** Org referral tools — before `/company` leadership catch-all (Brief 1.5 Phase 3). */
  { prefix: "/company/referrals", roles: ["leadership", "recruiter"] },
  /** Company admin overview and org-wide company hub. */
  { prefix: "/company", roles: ["leadership"] },
  { prefix: "/recruit/settings/pipeline", roles: ["recruiter", "leadership", "super_admin"] },
  {
    prefix: "/recruit/candidates",
    roles: ["recruiter", "leadership", "hiring_manager", "agency", "super_admin"],
  },
  {
    prefix: "/recruit/hiring-requests",
    roles: ["recruiter", "leadership", "hiring_manager", "super_admin"],
  },
  {
    prefix: "/recruit/analytics",
    roles: ["recruiter", "leadership", "hiring_manager", "super_admin"],
  },
  /**
   * The v2 tree. It fell under the catch-all `/recruit` rule, which admits only
   * recruiter/leadership/super_admin — so the hiring-manager screens built
   * inside it were unreachable by the managers they exist for.
   *
   * Hiring managers are in-org and their seat needs the job workspace, the
   * scorecard and the interview brief, all of which live under this prefix.
   *
   * Agency was excluded while the screens in this tree did no role check of
   * their own — one line here was the entire boundary between an external
   * partner and the org candidate database, the talent pool and Hiring Setup.
   *
   * Both preconditions named in that exclusion are now met: every screen in
   * the tree gates itself through SeatGate against the capability table in
   * lib/v2/seat-capabilities (asserted in tests/unit/v2-seat-gating.test.ts),
   * and the agency seat is finished — ag:submit and ag:candidate are built.
   *
   * So the tree now has two walls, and either alone keeps a partner out. This
   * line is the outer one; deleting a SeatGate no longer opens the database.
   */
  {
    prefix: "/recruit/v2",
    roles: ["recruiter", "leadership", "hiring_manager", "agency", "super_admin"],
  },
  /** Brief 11: HM/leadership need job workspace (Plan | Candidates) when plan document flag is on. */
  {
    prefix: "/recruit/jobs",
    roles: ["recruiter", "leadership", "hiring_manager", "super_admin"],
  },
  // Canonical shared workspaces retain access from their former company aliases.
  {
    prefix: "/recruit/assessments",
    roles: ["recruiter", "leadership", "hiring_manager", "interviewer", "super_admin"],
  },
  {
    prefix: "/recruit/interview-prep",
    roles: ["recruiter", "leadership", "hiring_manager", "interviewer", "super_admin"],
  },
  { prefix: "/recruit", roles: ["recruiter", "leadership", "super_admin"] },
  /** Work-driven UI: the same recruiting work, reached through the work item. */
  { prefix: "/work", roles: ["recruiter", "leadership", "super_admin"] },
  { prefix: "/agency", roles: ["agency"] },
  { prefix: "/employee", roles: ["employee"] },
  /** Referrer hub: every signed-in product role may open the page (feature UI may still gate). */
  { prefix: "/dashboard/referrer", roles: ALL_PRODUCT_ROLES },
  { prefix: "/candidate", roles: ["candidate_pro", "candidate_free"] },
  { prefix: "/profile", roles: ALL_PRODUCT_ROLES },
  { prefix: "/support-requests", roles: ALL_PRODUCT_ROLES },
  { prefix: "/messages", roles: ALL_PRODUCT_ROLES },
  { prefix: "/notifications", roles: ALL_PRODUCT_ROLES },
];

/** Prefix list for middleware session + RBAC (order matches `DASHBOARD_ROUTE_ACCESS_RULES`). */
export const DASHBOARD_MIDDLEWARE_PROTECTED_PREFIXES: string[] = DASHBOARD_ROUTE_ACCESS_RULES.map(
  (r) => r.prefix,
);

/** Map prefix → roles array (for middleware). */
export const DASHBOARD_MIDDLEWARE_PREFIX_ROLES: Record<string, UserRole[]> = Object.fromEntries(
  DASHBOARD_ROUTE_ACCESS_RULES.map((r) => [r.prefix, [...r.roles]]),
) as Record<string, UserRole[]>;

/**
 * Prefix match that respects path segment boundaries.
 * Example: "/candidate" matches "/candidate" and "/candidate/jobs",
 * but not "/candidates".
 */
export function matchesDashboardPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Most specific matching route rule (longest prefix wins). */
export function resolveDashboardRouteAccessRule(pathname: string): {
  prefix: string;
  roles: readonly UserRole[];
} | null {
  let best: { prefix: string; roles: readonly UserRole[] } | null = null;
  let bestLen = -1;
  for (const rule of DASHBOARD_ROUTE_ACCESS_RULES) {
    if (!matchesDashboardPrefix(pathname, rule.prefix)) continue;
    if (rule.prefix.length > bestLen) {
      best = rule;
      bestLen = rule.prefix.length;
    }
  }
  return best;
}
