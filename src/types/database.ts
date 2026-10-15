/**
 * Single source of truth for user roles. Use in RBAC, Zod schemas, and UI.
 * Keeps DB enum and app types in sync.
 */
export const USER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "interviewer",
  "finance",
  "agency",
  "hiring_manager",
  "employee",
  "candidate_pro",
  "candidate_free",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Roles that belong to a company organisation (used for org-level auth policies like SSO enforcement). */
export const COMPANY_SIDE_ROLES = [
  "leadership",
  "recruiter",
  "interviewer",
  "finance",
  "hiring_manager",
  "employee",
] as const satisfies readonly UserRole[];

/** Roles that can be assigned when inviting a member to an organisation. */
export const ORG_INVITE_ROLES = [
  "recruiter",
  "interviewer",
  "finance",
  "leadership",
  "hiring_manager",
  "agency",
  "employee",
] as const;

export type OrgInviteRole = (typeof ORG_INVITE_ROLES)[number];

/**
 * Roles that may be assigned to a user via automated identity provisioning
 * (SCIM / Entra group mappings). This is `ORG_INVITE_ROLES` minus any
 * platform/elevated role: `super_admin` must NEVER be assignable through
 * SCIM or Entra, so it is explicitly excluded here as defense in depth.
 */
export const SCIM_ASSIGNABLE_ROLES = ORG_INVITE_ROLES.filter(
  // `super_admin` is not part of ORG_INVITE_ROLES today; the explicit exclusion
  // keeps this set safe if that ever changes (compare via string to satisfy TS).
  (role): role is Exclude<OrgInviteRole, "super_admin"> => (role as string) !== "super_admin",
);

/** Type guard: is the given value a role that automated provisioning may assign? */
export function isScimAssignableRole(value: unknown): value is OrgInviteRole {
  return typeof value === "string" && (SCIM_ASSIGNABLE_ROLES as readonly string[]).includes(value);
}

/** Type guard: is the given value a role that may be assigned via an org invite? */
export function isOrgInviteRole(value: unknown): value is OrgInviteRole {
  return typeof value === "string" && (ORG_INVITE_ROLES as readonly string[]).includes(value);
}

export const IDENTITY_SOURCES = ["manual", "csv", "azure"] as const;
export type IdentitySource = (typeof IDENTITY_SOURCES)[number];

/** Human-readable labels for each role (UI). */
export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  leadership: "Leadership",
  recruiter: "Recruiter",
  interviewer: "Interviewer",
  finance: "Finance",
  agency: "Agency / RPO",
  hiring_manager: "Hiring Manager",
  employee: "Employee",
  candidate_pro: "Candidate Pro",
  candidate_free: "Candidate Free",
};

/**
 * Dashboard path for each role (redirects, nav).
 *
 * The three hiring seats land on their own work, not on a tile grid. Every
 * recruiter tile — applications today, open jobs, stale pipeline — is now a
 * column on the Jobs list with a blocker attached, and leadership's are the
 * Portfolio. A landing page that restates the next screen is a click, not an
 * overview.
 *
 * /home stays exactly as it is for interviewer and finance. The approved design
 * covers five seats and neither of those is among them, so nothing replaced
 * their tiles — dropping the page for everyone would leave those two with a
 * single nav item and nowhere to start.
 */
export const ROLE_DASHBOARD_PATH: Record<UserRole, string> = {
  super_admin: "/admin",
  leadership: "/company",
  recruiter: "/recruit/jobs",
  interviewer: "/home",
  finance: "/home",
  agency: "/agency",
  hiring_manager: "/company/my-jobs",
  employee: "/employee",
  candidate_pro: "/candidate",
  candidate_free: "/candidate",
};
