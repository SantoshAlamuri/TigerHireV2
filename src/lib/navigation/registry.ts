import type { ComponentType } from "react";
import type { EntitlementFeatureKey } from "@/lib/entitlements/config";
import { capabilitiesFor } from "@/lib/v2/seat-capabilities";
import type { UserRole } from "@/types/database";

/**
 * NAV_REGISTRY is the single source of truth for nav visibility.
 *
 * To add a new nav entry: add it here, set visibleTo, set includeInNavChrome.
 *
 * Where it surfaces:
 *   - Top nav: include path in PRIMARY_NAV_BY_ROLE[role] (`primary-nav-by-role.ts`)
 *   - Sidebar: include entry id in NAV_GROUP_STRUCTURE_BY_ROLE[role][group].entryIds
 *
 * Do NOT add hrefs to NAV_GROUPS_BY_ROLE directly. Customer-shell sidebar entries
 * are composed from this registry via `compose-sidebar-groups.ts`.
 */
export type NavUser = { role: UserRole; is_org_admin: boolean };

export type NavEntry = {
  id: string;
  label: string;
  path: string | null;
  parent: string | null;
  visibleTo: (user: NavUser) => boolean;
  icon?: ComponentType<{ size?: number; className?: string }>;
  order: number;
  subtitle?: string;
  /** When set, overrides `path` for URL resolution (role-aware URLs until Brief 2). */
  resolvePath?: (user: NavUser) => string;
  /** When set, overrides `label` for role-conditional nav chrome (e.g. employee top nav). */
  resolveLabel?: (user: NavUser) => string;
  /** When false, entry is omitted from top nav / sidebar chrome (route stays valid). */
  includeInNavChrome?: boolean;
  /** When set, entry is hidden if org entitlement `features[key] === false`. */
  requiresEntitlement?: EntitlementFeatureKey;
};

const L = "leadership" satisfies UserRole;
const R = "recruiter" satisfies UserRole;
const HM = "hiring_manager" satisfies UserRole;
const IV = "interviewer" satisfies UserRole;
const FN = "finance" satisfies UserRole;
const EM = "employee" satisfies UserRole;

const inRoles =
  (...roles: UserRole[]) =>
  (u: NavUser) =>
    roles.includes(u.role);

const orgAdmin = (u: NavUser) => u.is_org_admin === true;

/** Customer-shell roles (Brief 1.5 scope; excludes agency/candidate/super_admin nav). */
export const NAV_REGISTRY_CUSTOMER_ROLES = [
  L,
  R,
  HM,
  IV,
  FN,
  EM,
] as const satisfies readonly UserRole[];

const customerShell = inRoles(...NAV_REGISTRY_CUSTOMER_ROLES);

/**
 * Phase 1 registry: target IA from Brief 1.5 §5.3–5.4 plus every legacy customer-shell
 * nav href (PRIMARY_NAV_BY_ROLE + sidebar NAV_GROUPS_BY_ROLE) represented as an entry
 * with a non-redirect `path` / `resolvePath` target.
 */
export const NAV_REGISTRY: NavEntry[] = [
  // ─── Top level ─────────────────────────────────────────────────────────────
  {
    id: "home",
    label: "Home",
    path: null,
    resolvePath: (user) => (user.role === L ? "/company" : "/home"),
    resolveLabel: (user) => (user.role === L ? "Overview" : "Home"),
    parent: null,
    order: 10,
    subtitle: "Your workspace overview — jump into operational routes from any tile.",
    visibleTo: customerShell,
  },
  {
    id: "jobs",
    label: "Jobs",
    path: null,
    parent: null,
    order: 20,
    visibleTo: inRoles(L, R, HM),
    // Shared list retains all status filters; company bookmarks keep their detail context.
    resolvePath: (u) => {
      if (u.role === HM) return "/company/my-jobs";
      return "/recruit/jobs";
    },
    resolveLabel: (u) => (u.role === HM ? "Overview" : "Jobs"),
  },
  {
    id: "candidates",
    label: "Candidates",
    path: "/recruit/candidates",
    parent: null,
    order: 30,
    /** Interviewer + `/recruit/candidates` is aspirational in Brief 1.5; current route policy excludes IV here. */
    visibleTo: inRoles(L, R, HM),
    subtitle: "People your organisation can access via FitScore or unlocks.",
  },
  {
    id: "inbox",
    label: "Inbox",
    path: "/messages",
    parent: null,
    order: 40,
    subtitle: "In-app messaging",
    visibleTo: customerShell,
    // hidden 2026-05-16, see Brief 1.5 Phase 3
    includeInNavChrome: false,
  },
  {
    id: "calendar",
    label: "This week",
    path: "/calendar",
    parent: null,
    order: 48,
    subtitle: "Org-wide timeline — interviews, assessments, offer deadlines, and scheduling gaps.",
    visibleTo: (u) => {
      const on =
        process.env.FF_PLAN_DOCUMENT === "true" ||
        process.env.NEXT_PUBLIC_FF_PLAN_DOCUMENT === "true";
      return on && inRoles(L, R, HM)(u);
    },
  },
  {
    id: "tasks",
    label: "Tasks",
    path: "/tasks",
    parent: null,
    order: 49,
    subtitle: "Pending approvals, feedback, and scheduling actions.",
    visibleTo: (u) => {
      const on =
        process.env.FF_PLAN_DOCUMENT === "true" ||
        process.env.NEXT_PUBLIC_FF_PLAN_DOCUMENT === "true";
      return on && inRoles(L, R, HM)(u);
    },
  },
  {
    id: "interviews",
    label: "Interviews",
    path: null,
    parent: null,
    order: 50,
    visibleTo: inRoles(L, R, HM, IV),
  },
  {
    id: "referrals",
    label: "Referrals",
    path: "/company/referrals",
    parent: null,
    order: 60,
    subtitle: "Confirm referral bonuses and download the finance statement.",
    /**
     * Employees are not listed here any more. Their entry resolved to
     * `/dashboard/referrer`, which redirects an employee straight to `/employee`
     * — the same hub their Home entry already points at. Three of this seat's
     * four referral links were redirect stubs onto one page; the destination is
     * unchanged, only the duplicate signposting is gone.
     */
    visibleTo: inRoles(L, R),
  },
  {
    id: "analytics",
    label: "Analytics",
    path: "/recruit/analytics",
    parent: null,
    order: 70,
    subtitle: "Hiring metrics, funnel health, and exports.",
    visibleTo: inRoles(L, R, HM),
  },
  {
    id: "analytics-legacy",
    label: "Analytics (previous report)",
    path: "/recruit/analytics/legacy",
    parent: null,
    order: 71,
    subtitle: "The pre-redesign report, kept for its exports and advanced sections.",
    visibleTo: inRoles(L, R, HM),
  },
  {
    id: "finance",
    label: "Finance Inbox",
    path: "/company/finance",
    parent: null,
    order: 80,
    subtitle: "Finance approvals queue for pending offers.",
    visibleTo: inRoles(FN),
  },
  {
    /**
     * The finance seat is who the referral statement is for, and until now it
     * was the one seat with no referral entry at all — the report existed and
     * the people who reconcile it had no route to it.
     */
    id: "finance.referral_statement",
    label: "Referral statement",
    path: "/company/finance/referral-statement",
    parent: "finance",
    order: 81,
    subtitle: "Referral bonuses TigerHire paid on your jobs, by month.",
    visibleTo: inRoles(FN, L),
  },
  {
    id: "setup",
    label: "Setup",
    path: "/setup",
    parent: null,
    order: 90,
    // hidden 2026-05-16, see Brief 1.5 Phase 3
    /** Top-bar org-admin entry only (Brief 1.5 Phase 3). */
    includeInNavChrome: false,
    visibleTo: (u) => customerShell(u) && orgAdmin(u),
  },
  {
    id: "workspace",
    label: "Workspace",
    path: "/employee",
    parent: null,
    order: 15,
    visibleTo: inRoles(EM),
    resolveLabel: (u) => (u.role === EM ? "Home" : "Workspace"),
    subtitle: "Refer great candidates and earn bonuses.",
  },

  // ─── jobs.* ────────────────────────────────────────────────────────────────
  {
    id: "jobs.org_overview",
    label: "Overview",
    path: "/company",
    parent: "jobs",
    order: 10,
    subtitle: "Overview of your hiring pipeline",
    visibleTo: inRoles(L),
    // hidden 2026-05-16, see Brief 1.5 Phase 3
    includeInNavChrome: false,
  },
  {
    id: "jobs.recruiting_hub",
    label: "Recruiting hub",
    path: "/recruit",
    parent: "jobs",
    order: 20,
    subtitle: "What is coming up, what changed, and what needs action",
    visibleTo: inRoles(R, L),
    // hidden 2026-05-16, see Brief 1.5 Phase 3
    includeInNavChrome: false,
  },
  {
    id: "jobs.pipeline",
    label: "Pipeline",
    path: null,
    parent: "jobs",
    order: 30,
    visibleTo: inRoles(L, R, HM),
    resolvePath: (u) => (u.role === HM ? "/company/my-pipeline" : "/recruit/pipeline"),
  },
  {
    id: "jobs.approvals",
    label: "Tasks",
    path: "/tasks",
    parent: "jobs",
    order: 40,
    subtitle: "Decisions and actions assigned to you",
    visibleTo: inRoles(L, R, HM),
  },
  {
    id: "jobs.offers",
    label: "Offers",
    path: null,
    parent: "jobs",
    order: 50,
    subtitle: "Create and track offer rollout from one place.",
    visibleTo: inRoles(L, R, HM),
    requiresEntitlement: "offers",
    resolvePath: () => "/company/offers",
  },
  {
    id: "jobs.offers_draft",
    label: "Draft offers",
    path: null,
    parent: "jobs",
    order: 60,
    visibleTo: inRoles(L, R, HM),
    requiresEntitlement: "offers",
    resolvePath: () => "/company/offers/draft",
  },
  {
    id: "jobs.assessments",
    label: "Assessments",
    path: null,
    parent: "jobs",
    order: 70,
    subtitle: "Assign templates, share with candidates, and rate submissions.",
    visibleTo: inRoles(L, R, HM),
    requiresEntitlement: "assessments",
    resolvePath: () => "/recruit/assessments",
  },
  {
    id: "jobs.requisitions",
    label: "Hiring requests",
    path: null,
    parent: "jobs",
    order: 80,
    visibleTo: inRoles(L, R, HM),
    resolvePath: () => "/company/hiring-requests",
  },
  {
    id: "jobs.applications",
    label: "Applications",
    path: "/recruit/applications",
    parent: "jobs",
    order: 90,
    subtitle: "Inbound applicants only.",
    visibleTo: inRoles(L, R),
  },
  /**
   * The three destinations that used to live on a second nav rail.
   *
   * `/recruit/v2/*` shipped with its own left rail, so every one of these
   * screens rendered two competing navigations — the shell's, and a rail whose
   * first three links (Jobs, Candidates, Analytics) were duplicates of tabs
   * already on screen. The rail is gone; these are the destinations it alone
   * carried, and they now hang off Jobs like everything else.
   *
   * Visibility reads from the seat capability table rather than a role list, so
   * who sees Portfolio is decided in exactly one place — the same table the
   * pages' own SeatGate checks. A seat that cannot open the page is never
   * offered the link.
   */
  {
    /**
     * The pre-redesign jobs table. Nothing in the nav points here any more —
     * the Jobs tab resolves to /recruit/jobs for every seat that can reach it —
     * but the page is live and bookmarked, so it stays a registered destination
     * rather than a route the nav layer has forgotten about.
     */
    id: "jobs.company_table",
    label: "Jobs (previous list)",
    path: "/company/jobs",
    parent: "jobs",
    order: 21,
    includeInNavChrome: false,
    visibleTo: inRoles(L),
  },
  {
    id: "jobs.portfolio",
    label: "Portfolio",
    path: "/recruit/v2/portfolio",
    parent: "jobs",
    order: 25,
    subtitle: "Every open job, what is blocking it, and whose name is on that.",
    visibleTo: (u) => customerShell(u) && capabilitiesFor(u.role).viewPortfolio,
  },
  {
    id: "jobs.governance",
    label: "Governance",
    path: "/recruit/v2/governance",
    parent: "jobs",
    order: 45,
    subtitle: "Rubrics waiting on a signature, and what each one is holding up.",
    visibleTo: (u) => customerShell(u) && capabilitiesFor(u.role).approveRubrics,
  },
  {
    id: "jobs.hiring_setup",
    label: "Hiring setup",
    path: "/recruit/v2/setup",
    parent: "jobs",
    order: 110,
    subtitle: "Rubric library, screening questions, benchmarks, and interview kits.",
    visibleTo: (u) => customerShell(u) && capabilitiesFor(u.role).editJobSetup,
  },
  /**
   * Per-user calendar integrations — not really “jobs” work; parent `jobs` was chosen in Phase 1 only to
   * avoid an 8th top-level tab while the registry ships alongside legacy nav.
   *
   * **Phase 2 product decision (pick one deliberately):**
   * - **Recommended:** surface this destination from the **user-menu / profile cluster** (top-right avatar),
   *   not as a Jobs sub-tab — clearer mental model for account-style settings.
   * - **Alternative:** keep it as a Jobs sub-tab if you prefer one fewer entry in the avatar menu.
   *
   * If moved to the user menu, drop this entry (or reparent to a non–top-nav `account.*` branch) and wire
   * the link in `TopNavigation` / profile UI only.
   */
  {
    id: "jobs.personal_settings",
    label: "Personal settings",
    path: "/company/my-settings/integrations",
    parent: "jobs",
    order: 100,
    // hidden 2026-05-16, see Brief 1.5 Phase 3
    includeInNavChrome: false,
    subtitle: "Connect your personal calendar for interview scheduling",
    visibleTo: inRoles(L, HM),
  },

  // ─── interviews.* ──────────────────────────────────────────────────────────
  {
    id: "interviews.calendar",
    label: "Interviews",
    path: "/company/interviews",
    parent: "interviews",
    order: 10,
    subtitle: "Assigned upcoming interviews and feedback status.",
    visibleTo: inRoles(L, R, HM, IV),
  },
  {
    id: "interviews.my_availability",
    label: "My availability",
    path: "/company/my-availability",
    parent: "interviews",
    order: 15,
    subtitle: "Declare when you are free for interview scheduling.",
    visibleTo: inRoles(L, R, HM, IV),
    // Recruiters used to be sent to /recruit/my-availability, which only redirects
    // to /company/my-availability — point straight at the canonical to avoid the hop. (#355 PR-0)
    resolvePath: () => "/company/my-availability",
  },
  {
    id: "interviews.prep",
    label: "Interview prep",
    path: null,
    parent: "interviews",
    order: 20,
    subtitle: "Prepare each interview with role context and candidate signal.",
    visibleTo: inRoles(L, R, HM, IV),
    resolvePath: () => "/recruit/interview-prep",
  },

  // ─── referrals.* ───────────────────────────────────────────────────────────
  {
    id: "referrals.active",
    label: "Active",
    path: "/dashboard/referrer",
    parent: "referrals",
    order: 10,
    visibleTo: inRoles(L, R, EM),
    resolvePath: (u) => (u.role === EM ? "/dashboard/referrer" : "/company/referrals"),
  },
  {
    id: "referrals.campaigns",
    label: "Campaigns",
    path: "/company/referrals/campaigns",
    parent: "referrals",
    order: 20,
    visibleTo: inRoles(L, R),
  },

  // ─── analytics.* ───────────────────────────────────────────────────────────
  {
    id: "analytics.saved_searches",
    label: "Saved searches",
    path: "/recruit/saved-searches",
    parent: "analytics",
    order: 20,
    subtitle: "Manage your saved searches and job alerts",
    visibleTo: inRoles(R),
  },

  // ─── setup.* (Brief 1.5 placeholder IA; full Setup is Brief 3) ──────────────
  {
    id: "setup.organization",
    label: "Organisation",
    path: "/setup/organization",
    parent: "setup",
    order: 10,
    visibleTo: (u) => customerShell(u) && orgAdmin(u),
  },
  {
    id: "setup.hiring_config",
    label: "Hiring config",
    path: "/setup/hiring-config",
    parent: "setup",
    order: 20,
    visibleTo: (u) => customerShell(u) && orgAdmin(u),
  },
  {
    id: "setup.comms",
    label: "Comms & trust",
    path: "/setup/comms",
    parent: "setup",
    order: 30,
    visibleTo: (u) => customerShell(u) && orgAdmin(u),
  },
  {
    id: "setup.platform",
    label: "Platform",
    path: "/setup/platform",
    parent: "setup",
    order: 40,
    visibleTo: (u) => customerShell(u) && orgAdmin(u),
  },

  // ─── workspace.* (employee) ──────────────────────────────────────────────
  {
    id: "workspace.resign",
    label: "Resign",
    path: "/employee/resign",
    parent: "workspace",
    order: 40,
    subtitle: "Declare your resignation",
    visibleTo: inRoles(EM),
  },
  // `workspace.refer` (/employee/refer) and `workspace.my_referrals`
  // (/employee/my-referrals) are gone from the nav. Both pages are five-line
  // redirects to /employee and /employee?tab=referrals — the hub the Home entry
  // already opens — so the employee was offered three routes to one screen. The
  // redirects stay, so existing links and bookmarks still land correctly.
  {
    id: "referrals.join",
    label: "Invite colleagues",
    path: "/dashboard/referrer/join",
    parent: "referrals",
    order: 15,
    visibleTo: inRoles(L, R, EM),
    resolvePath: () => "/dashboard/referrer/join",
  },
  {
    id: "account.my_settings",
    label: "My settings",
    path: "/company/my-settings",
    parent: null,
    order: 95,
    visibleTo: inRoles(HM),
    includeInNavChrome: false,
  },
];

const byId = new Map<string, NavEntry>(NAV_REGISTRY.map((e) => [e.id, e]));

export function assertNavRegistryIntegrity(): void {
  for (const e of NAV_REGISTRY) {
    if (e.parent != null && !byId.has(e.parent)) {
      throw new Error(`NAV_REGISTRY: dangling parent "${e.parent}" on entry "${e.id}"`);
    }
  }
}

assertNavRegistryIntegrity();
