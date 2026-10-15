"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { LogOut, Menu, Cog } from "lucide-react";
import TigerHireLogo from "@/components/TigerHireLogo";
import { useAuth } from "@/lib/auth/AuthProvider";
import { HIRING_SETUP_GROUP_LABEL } from "@/lib/navigation/sidebar-workflow";
import { getPrimaryNavHrefsForRole } from "@/lib/navigation/primary-nav-by-role";
import {
  buildNavResolverUser,
  resolvePrimaryNavEntries,
} from "@/lib/navigation/resolve-primary-nav";
import { isCustomerShellRole } from "@/lib/navigation/registry-resolver";
import { ROLE_DASHBOARD_PATH, type UserRole } from "@/types/database";
import { NotificationDropdown } from "./NotificationDropdown";
import { SupportRequestDialog } from "./SupportRequestDialog";
import type { NavGroup, NavItem } from "./sidebar-nav-groups";
import {
  getActiveNavHref,
  getNavHrefs,
  navHrefMatchesPathname,
  useDashboardNavGroups,
} from "./navigation";
import { filterPillClass } from "@/components/ui/filter-pill";

import type { User } from "@/types";

type TopNavigationProps = {
  onMenuClick: () => void;
};

type TopNavEntry = {
  href: string;
  label: string;
  groupLabel: string;
  icon?: NavItem["icon"];
};

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * LEGACY NAV OVERRIDE LAYER (audit F-12 — migration target)
 *
 * The maps below (label overrides, per-role secondary groupings, utility-group
 * heuristics) are the hand-maintained override layer for roles that have not yet
 * moved onto the declarative NAV_REGISTRY path (resolvePrimaryNavEntries +
 * compose-sidebar-groups). The end-state the audit calls for is a single
 * declarative per-role registry (label, primary/secondary, match rules) rendered
 * generically, retiring these tables.
 *
 * That migration is a scoped project requiring per-role runtime verification
 * across all 8 roles, so it is intentionally NOT bundled into this design-system
 * pass. New roles should be added to NAV_REGISTRY, NOT to these maps.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Legacy top-nav labels for roles outside NAV_REGISTRY (super_admin, agency, candidate). */
const LEGACY_TOP_NAV_LABEL_OVERRIDES: Record<string, string> = {
  "/admin": "Command Center",
  "/company": "Command Center",
  "/recruit": "Command Center",
  "/company/my-jobs": "Command Center",
  "/candidate": "Match Feed",
};

/** Rubric library, screening questions, benchmarks, comp bands — reached from the account menu. */
const HIRING_SETUP_HREF = "/recruit/v2/setup";

/** Super-admin Commercials cluster — used for secondary strip when any of these routes is active. */
const SUPER_ADMIN_COMMERCIAL_HREFS = [
  "/admin/billing",
  "/admin/plan-limits",
  "/admin/costs",
  "/admin/referrals",
  "/admin/payout-runs",
] as const;

const SECONDARY_NAV_BY_ROLE: Partial<Record<UserRole, Record<string, string[]>>> = {
  super_admin: {
    "/admin/billing": [...SUPER_ADMIN_COMMERCIAL_HREFS],
    "/admin/plan-limits": [...SUPER_ADMIN_COMMERCIAL_HREFS],
    "/admin/costs": [...SUPER_ADMIN_COMMERCIAL_HREFS],
    "/admin/referrals": [...SUPER_ADMIN_COMMERCIAL_HREFS],
    "/admin/payout-runs": [...SUPER_ADMIN_COMMERCIAL_HREFS],
  },
  leadership: {
    // /recruit/jobs/[id] is the shared job-detail workspace company roles land on;
    // map it back to the Jobs section so the tab stays highlighted (Jobs #8).
    // Portfolio, Governance and Hiring setup are here because they used to be
    // reachable only from a second nav rail inside /recruit/v2. Listing them
    // under Jobs is what makes the Jobs tab light up when one of them is open —
    // without it those routes render with no tab highlighted anywhere, which is
    // the "where am I" gap the rail was papering over.
    // Keyed on /recruit/jobs because that is where the Jobs tab now resolves
    // for leadership. /company/jobs stays in the list so the tab still lights
    // up for anyone arriving on the old table from a bookmark.
    "/recruit/jobs": [
      "/recruit/jobs",
      "/company/jobs",
      "/recruit/v2/portfolio",
      "/recruit/v2/governance",
      "/recruit/v2/setup",
    ],
    "/company/approvals": ["/company/approvals", "/company/hiring-requests"],
    "/company/offers": ["/company/offers", "/company/offers/draft"],
    "/recruit/candidates": ["/recruit/candidates"],
    "/company/interviews": [
      "/company/interviews",
      "/company/interview-prep",
      "/recruit/interview-prep",
    ],
  },
  recruiter: {
    "/recruit/jobs": ["/recruit/jobs", "/recruit/v2/portfolio", "/recruit/v2/setup"],
    "/company/approvals": ["/company/approvals", "/company/hiring-requests"],
    "/company/offers": ["/company/offers", "/company/offers/draft"],
    "/recruit/analytics": [
      "/recruit/analytics",
      "/recruit/analytics/legacy",
      "/recruit/saved-searches",
    ],
  },
  hiring_manager: {
    "/company/my-jobs": ["/company/my-jobs", "/recruit/jobs", "/company/hiring-requests"],
    "/company/my-pipeline": [
      "/company/my-pipeline",
      "/company/interview-prep",
      "/recruit/interview-prep",
      "/company/assessments",
      "/recruit/assessments",
    ],
    "/company/offers": ["/company/offers", "/company/offers/draft"],
  },
  // No agency entry on purpose. This map exists to claim routes that are NOT
  // primary tabs, so the parent tab still highlights when one is open. Agency had
  // "/agency/jobs": [..., "/agency/pipeline"] — but /agency/pipeline is already
  // its own top tab, so the entry claimed nothing and drew a second "Pipeline"
  // chip under Client roles. Nested agency routes keep their highlight through
  // the exact/nested match on the top tabs in `primaryActiveHref`.
  candidate_pro: {
    "/candidate/applications": ["/candidate/applications"],
    "/candidate/jobs": ["/candidate/jobs", "/candidate/assessments"],
    "/candidate": ["/candidate"],
  },
  candidate_free: {
    "/candidate/applications": ["/candidate/applications"],
    "/candidate/jobs": ["/candidate/jobs", "/candidate/assessments"],
    "/candidate": ["/candidate"],
  },
  employee: {
    "/employee": ["/employee"],
  },
};

/**
 * Routes a primary tab CLAIMS for highlighting but does not advertise as a sub-tab.
 *
 * Portfolio and Hiring setup were parked in the Jobs strip when the /recruit/v2
 * rail was deleted, because the rail was the only thing that carried them. That
 * left a recruiter's Jobs tab with a permanent second nav row whose two entries
 * were a lens on the list they were already looking at, and a config directory
 * opened a few times a month — chrome on every visit for errands that are not.
 *
 * Portfolio is now a switch in the Jobs page header (`JobsViewSwitch`) and
 * Hiring setup is in the account menu below. They stay in SECONDARY_NAV_BY_ROLE
 * so the Jobs tab still lights up while one of them is open — no highlighted tab
 * anywhere is the "where am I" gap the rail was papering over — they just no
 * longer draw a chip.
 */
const HREFS_CLAIMED_BUT_NOT_LISTED: ReadonlySet<string> = new Set([
  "/recruit/v2/portfolio",
  HIRING_SETUP_HREF,
]);

const SECONDARY_LABEL_OVERRIDES: Record<string, string> = {
  "/company/jobs": "All jobs",
  "/recruit/jobs": "All jobs",
  "/agency/jobs": "Client roles",
  "/candidate/jobs": "Browse jobs",
  "/recruit/applications": "Applications",
  "/company/hiring-requests": "Hiring requests",
  "/recruit/hiring-requests": "Hiring requests",
  "/candidate/applications": "Status & Scores",
  "/company/offers/draft": "Draft offers",
  "/recruit/offers/draft": "Draft offers",
  "/company/interview-prep": "Interview prep",
  "/recruit/interview-prep": "Interview prep",
  "/employee/my-referrals": "My referrals",
};

function topNavUserInitials(user: User): string {
  const raw = (user.name || user.email || "?").trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
  }
  const compact = raw.replace(/[^a-zA-Z0-9]/g, "");
  if (compact.length >= 2) return compact.slice(0, 2).toUpperCase();
  return raw.slice(0, 2).toUpperCase() || "?";
}

function flattenItems(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((group) => group.items);
}

function findItemWithGroup(navGroups: NavGroup[], href: string): TopNavEntry | null {
  for (const group of navGroups) {
    for (const item of group.items) {
      if (item.href === href) {
        return {
          href: item.href,
          icon: item.icon,
          label: legacyTopNavLabel(item),
          groupLabel: group.label,
        };
      }
      const child = item.children?.find((candidate) => candidate.href === href);
      if (child) {
        return {
          href: child.href,
          icon: child.icon ?? item.icon,
          label: SECONDARY_LABEL_OVERRIDES[child.href] ?? child.label,
          groupLabel: group.label,
        };
      }
    }
  }
  return null;
}

function getLegacyPrimaryNavEntries(role: UserRole, navGroups: NavGroup[]): TopNavEntry[] {
  const preferredHrefs = getPrimaryNavHrefsForRole(role);
  const resolved = preferredHrefs
    .map((href) => findItemWithGroup(navGroups, href))
    .filter((item): item is TopNavEntry => item != null);
  if (resolved.length > 0) return resolved;
  return navGroups
    .filter((group) => !group.subtle && group.items.length > 0)
    .map((group) => {
      const firstItem = group.items[0];
      return {
        href: firstItem.href,
        icon: firstItem.icon,
        label: legacyTopNavLabel(firstItem),
        groupLabel: group.label,
      };
    });
}

function isUtilityGroup(group: NavGroup): boolean {
  return (
    group.subtle === true ||
    group.autoHide === true ||
    group.label === "Account" ||
    group.label === "Administration" ||
    group.label === "Admin" ||
    group.label === HIRING_SETUP_GROUP_LABEL ||
    group.label.includes("Setup") ||
    group.label.includes("Governance")
  );
}

function getUtilityNavGroups(navGroups: NavGroup[]): NavGroup[] {
  return navGroups.filter((group) => isUtilityGroup(group) && group.items.length > 0);
}

/** Hiring setup lists workflow shortcuts first; the top "Setup" tab must land on org defaults (pipeline). */
function canonicalUtilityTabItem(group: NavGroup): NavItem {
  const items = group.items;
  const first = items[0];
  if (!first) {
    throw new Error("utility nav group has no items");
  }
  if (group.label === HIRING_SETUP_GROUP_LABEL) {
    const pipeline = items.find((i) => i.href.includes("/settings/pipeline"));
    if (pipeline) return pipeline;
    const settings = items.find((i) => i.href.includes("/settings/"));
    if (settings) return settings;
  }
  return first;
}

function canonicalUtilityTabHref(group: NavGroup): string | null {
  try {
    return canonicalUtilityTabItem(group).href;
  } catch {
    return null;
  }
}

function getUtilityNavEntries(navGroups: NavGroup[]): TopNavEntry[] {
  return getUtilityNavGroups(navGroups).map((group) => {
    const anchor = canonicalUtilityTabItem(group);
    return {
      href: anchor.href,
      icon: anchor.icon,
      label: utilityGroupLabel(group.label),
      groupLabel: group.label,
    };
  });
}

function groupContainsHref(group: NavGroup, href: string | null): boolean {
  if (!href) return false;
  return group.items.some(
    (item) => item.href === href || item.children?.some((child) => child.href === href),
  );
}

function legacyTopNavLabel(item: NavItem): string {
  return LEGACY_TOP_NAV_LABEL_OVERRIDES[item.href] ?? item.label;
}

function secondaryNavLabel(item: Pick<NavItem, "href" | "label">): string {
  return SECONDARY_LABEL_OVERRIDES[item.href] ?? item.label;
}

function utilityGroupLabel(label: string): string {
  if (label === "Administration") return "Admin";
  if (label === HIRING_SETUP_GROUP_LABEL || label.includes("Setup")) return "Setup";
  if (label.includes("Governance")) return "Governance";
  return label;
}

export function TopNavigation({ onMenuClick }: TopNavigationProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { navGroups, features } = useDashboardNavGroups();
  const [supportOpen, setSupportOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountMenuOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (accountMenuRef.current?.contains(e.target as Node)) return;
      setAccountMenuOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAccountMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [accountMenuOpen]);

  const resolverUser = useMemo(
    () => (user ? buildNavResolverUser(user, features) : null),
    [user, features],
  );

  const primaryItems = useMemo(() => {
    if (!user) return [];
    if (isCustomerShellRole(user.role) && resolverUser) {
      const fromRegistry = resolvePrimaryNavEntries(user, navGroups, resolverUser);
      if (fromRegistry.length > 0) {
        return fromRegistry.map((item) => ({
          href: item.href,
          icon: undefined,
          label: item.label,
          groupLabel: item.groupLabel,
        }));
      }
    }
    return getLegacyPrimaryNavEntries(user.role, navGroups);
  }, [navGroups, resolverUser, user]);
  const utilityGroups = useMemo(() => getUtilityNavGroups(navGroups), [navGroups]);
  const utilityItems = useMemo(() => getUtilityNavEntries(navGroups), [navGroups]);
  const topItems = useMemo(() => [...primaryItems, ...utilityItems], [primaryItems, utilityItems]);
  const allNavItems = useMemo(() => flattenItems(navGroups), [navGroups]);
  // Resolved from the composed groups rather than re-checking `editJobSetup` here:
  // the registry entry already ran its own visibleTo, so the menu offers the page
  // to exactly the seats that can open it — including recruiters who are not org
  // admins, who would lose it entirely if this hung off the org-setup gear.
  const hiringSetupItem = useMemo(
    () => allNavItems.find((item) => item.href === HIRING_SETUP_HREF) ?? null,
    [allNavItems],
  );
  const allNavHrefs = useMemo(() => getNavHrefs(allNavItems), [allNavItems]);
  const activeNavHref = useMemo(
    () => getActiveNavHref(pathname, allNavHrefs),
    [allNavHrefs, pathname],
  );
  const activeGroup = useMemo(
    () => navGroups.find((group) => groupContainsHref(group, activeNavHref)) ?? null,
    [activeNavHref, navGroups],
  );
  const primaryActiveHref = useMemo(() => {
    const exact = topItems.find((item) => activeNavHref === item.href);
    if (exact) return exact.href;
    const nested = topItems.find((item) => navHrefMatchesPathname(pathname, item.href));
    if (nested) return nested.href;
    if (!user) return null;
    const secondaryByPrimary = SECONDARY_NAV_BY_ROLE[user.role] ?? {};
    const matched = topItems.find((item) =>
      (secondaryByPrimary[item.href] ?? []).some(
        (href) => activeNavHref === href || navHrefMatchesPathname(pathname, href),
      ),
    );
    if (matched) return matched.href;
    // Only treat a utility top tab as active when this route matches that tab's canonical href
    // OR any sibling link in the same utility group (e.g. all Hiring setup settings + referrals).
    const utilityGroupMatch = utilityGroups.find((group) =>
      group.items.some(
        (item) =>
          activeNavHref === item.href ||
          navHrefMatchesPathname(pathname, item.href) ||
          Boolean(
            item.children?.some(
              (c) => activeNavHref === c.href || navHrefMatchesPathname(pathname, c.href),
            ),
          ),
      ),
    );
    if (utilityGroupMatch && activeGroup && utilityGroupMatch.label === activeGroup.label) {
      const canonical = canonicalUtilityTabHref(utilityGroupMatch);
      if (canonical) return canonical;
    }
    if (activeGroup && !isUtilityGroup(activeGroup)) {
      const candidates = primaryItems.filter((p) => p.groupLabel === activeGroup.label);
      const matched = candidates.find(
        (p) => activeNavHref === p.href || navHrefMatchesPathname(pathname, p.href),
      );
      if (matched) return matched.href;
    }
    return null;
  }, [activeNavHref, activeGroup, pathname, primaryItems, topItems, user, utilityGroups]);
  // The single primary tab to highlight. When the route isn't itself a top tab (e.g. New
  // Hiring Request), fall back to the active group's ANCHOR tab only — never light up every
  // tab that happens to share the group, which is what produced the multi-highlight.
  const resolvedPrimaryHref = useMemo(() => {
    if (primaryActiveHref) return primaryActiveHref;
    if (!activeGroup || isUtilityGroup(activeGroup)) return null;
    return primaryItems.find((p) => p.groupLabel === activeGroup.label)?.href ?? null;
  }, [primaryActiveHref, activeGroup, primaryItems]);
  const secondaryItems = useMemo(() => {
    if (!user || !primaryActiveHref) return [];
    const secondaryHrefs = SECONDARY_NAV_BY_ROLE[user.role]?.[primaryActiveHref] ?? [];
    if (secondaryHrefs.length > 0) {
      const seen = new Set<string>();
      return secondaryHrefs
        .filter((href) => href !== primaryActiveHref && !HREFS_CLAIMED_BUT_NOT_LISTED.has(href))
        .map((href) => findItemWithGroup(navGroups, href))
        .filter((item): item is TopNavEntry => item != null)
        .filter((item) => {
          if (seen.has(item.href)) return false;
          seen.add(item.href);
          return true;
        })
        .map((item) => ({
          href: item.href,
          icon: item.icon,
          label: item.label,
        }));
    }
    const utilityGroup = utilityGroups.find(
      (group) => canonicalUtilityTabHref(group) === primaryActiveHref,
    );
    return (
      utilityGroup?.items
        .filter(
          (item) => item.href !== primaryActiveHref && !HREFS_CLAIMED_BUT_NOT_LISTED.has(item.href),
        )
        .map((item) => ({
          href: item.href,
          icon: item.icon,
          label: item.label,
        })) ?? []
    );
  }, [navGroups, primaryActiveHref, user, utilityGroups]);
  const showSecondaryNav = secondaryItems.length > 0;

  const logoHref = user ? (ROLE_DASHBOARD_PATH[user.role] ?? "/candidate") : "/";

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-[var(--border)]/80 bg-[var(--bg)]/92 pt-[env(safe-area-inset-top)] backdrop-blur-lg">
      <div className="flex min-h-16 items-center gap-2 px-3 py-2 sm:gap-3 sm:px-5 lg:gap-4 lg:px-6">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="-ml-1.5 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)] focus-ring lg:hidden"
        >
          <Menu size={24} />
        </button>

        <TigerHireLogo
          href={logoHref}
          variant="dark"
          size="md"
          className="h-9 w-auto shrink-0 lg:hidden"
        />

        <div className="hidden min-w-0 flex-1 items-center gap-3 lg:flex lg:gap-5">
          <TigerHireLogo href={logoHref} variant="dark" size="md" className="h-9 w-auto shrink-0" />
          <nav
            aria-label="Primary dashboard navigation"
            // Right-edge fade hints that more tabs exist off-screen on role-heavy
            // accounts, since the horizontal scrollbar is visually hidden (F-13).
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [mask-image:linear-gradient(to_right,#000_0,#000_calc(100%-28px),transparent_100%)] [&::-webkit-scrollbar]:hidden"
          >
            {primaryItems.map((item) => {
              const active = resolvedPrimaryHref === item.href;
              return (
                <Link
                  key={`${item.groupLabel}-${item.href}`}
                  href={item.href}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={`relative inline-flex shrink-0 items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-ring ${
                    active
                      ? "bg-white/[0.06] text-white"
                      : "text-white/62 hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  {item.label}
                  {active && (
                    <span
                      className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[var(--accent)]"
                      aria-hidden
                    />
                  )}
                </Link>
              );
            })}
          </nav>
          {utilityItems.length > 0 ? (
            <nav
              aria-label="Utility dashboard navigation"
              className="flex shrink-0 items-center gap-1 border-l border-[var(--border)] pl-3"
            >
              {utilityItems.map((item) => {
                const active = primaryActiveHref === item.href;
                return (
                  <Link
                    key={`${item.groupLabel}-${item.href}`}
                    href={item.href}
                    scroll={false}
                    aria-current={active ? "page" : undefined}
                    className={`relative inline-flex shrink-0 items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-ring ${
                      active
                        ? "bg-white/[0.06] text-white"
                        : "text-white/55 hover:bg-white/[0.04] hover:text-white"
                    }`}
                  >
                    {item.label}
                    {active && (
                      <span
                        className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[var(--accent)]"
                        aria-hidden
                      />
                    )}
                  </Link>
                );
              })}
            </nav>
          ) : null}
        </div>

        <div className="flex-1 lg:hidden" />

        <div className="flex shrink-0 items-center gap-1">
          {user?.isOrgAdmin ? (
            <Link
              href="/setup"
              title="Organisation setup"
              aria-label="Organisation setup"
              className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-dashed border-amber-400/55 bg-amber-500/10 text-amber-200 transition hover:bg-amber-500/20 focus-ring"
            >
              <Cog size={20} strokeWidth={2} />
            </Link>
          ) : null}
          <NotificationDropdown />
          {user ? (
            <div className="relative" ref={accountMenuRef}>
              <button
                type="button"
                aria-expanded={accountMenuOpen}
                aria-haspopup="menu"
                aria-label="Account and setup menu"
                onClick={() => setAccountMenuOpen((o) => !o)}
                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]/60 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-[var(--surface)] focus-ring"
              >
                {topNavUserInitials(user)}
              </button>
              {accountMenuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-1.5 min-w-[12.5rem] rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-xl"
                >
                  <Link
                    role="menuitem"
                    href="/profile"
                    className="block px-3 py-2 text-sm text-[var(--text)] hover:bg-white/[0.06]"
                    onClick={() => setAccountMenuOpen(false)}
                  >
                    Profile
                  </Link>
                  {(user.role === "leadership" || user.role === "hiring_manager") && (
                    <Link
                      role="menuitem"
                      href="/company/my-settings/integrations"
                      className="block px-3 py-2 text-sm text-[var(--text)] hover:bg-white/[0.06]"
                      onClick={() => setAccountMenuOpen(false)}
                    >
                      My settings
                    </Link>
                  )}
                  {hiringSetupItem ? (
                    <>
                      <div className="my-1 border-t border-[var(--border)]/60" aria-hidden />
                      <Link
                        role="menuitem"
                        href={hiringSetupItem.href}
                        className="block px-3 py-2 text-sm text-[var(--text)] hover:bg-white/[0.06]"
                        onClick={() => setAccountMenuOpen(false)}
                      >
                        {hiringSetupItem.label}
                      </Link>
                      <div className="my-1 border-t border-[var(--border)]/60" aria-hidden />
                    </>
                  ) : null}
                  {user.role !== "super_admin" ? (
                    <>
                      <Link
                        role="menuitem"
                        href="/support-requests"
                        className="block px-3 py-2 text-sm text-[var(--text)] hover:bg-white/[0.06]"
                        onClick={() => setAccountMenuOpen(false)}
                      >
                        Support tickets
                      </Link>
                      <button
                        role="menuitem"
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-white/[0.06]"
                        onClick={() => {
                          setAccountMenuOpen(false);
                          setSupportOpen(true);
                        }}
                      >
                        Raise support request
                      </button>
                    </>
                  ) : null}
                  <div className="my-1 border-t border-[var(--border)]/60" aria-hidden />
                  <button
                    role="menuitem"
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      void logout();
                    }}
                  >
                    <LogOut size={16} aria-hidden />
                    Log out
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {showSecondaryNav ? (
        <div className="hidden shrink-0 border-t border-[var(--border)]/45 px-3 sm:px-5 lg:block lg:px-6">
          <nav
            aria-label={`${activeGroup?.label ?? "Section"} navigation`}
            className="flex h-10 items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [mask-image:linear-gradient(to_right,#000_0,#000_calc(100%-28px),transparent_100%)] [&::-webkit-scrollbar]:hidden"
          >
            {secondaryItems.map((item) => {
              const active =
                activeNavHref === item.href || navHrefMatchesPathname(pathname, item.href);
              return (
                <Link
                  key={`${activeGroup?.label ?? "secondary"}-${item.href}-${item.label}`}
                  href={item.href}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={`${filterPillClass(active, "sm")} shrink-0`}
                >
                  {secondaryNavLabel(item)}
                </Link>
              );
            })}
          </nav>
        </div>
      ) : null}
      <SupportRequestDialog open={supportOpen} onClose={() => setSupportOpen(false)} />
    </header>
  );
}
