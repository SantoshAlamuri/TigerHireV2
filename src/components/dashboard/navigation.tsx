"use client";

import { useMemo } from "react";
import { DollarSign } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useApiQuery } from "@/lib/hooks/use-api";
import type { EntitlementFeatureKey } from "@/lib/entitlements/config";
import { HIRING_WORKFLOW_GROUP_LABEL } from "@/lib/navigation/sidebar-workflow";
import { composeSidebarGroupsForRole } from "@/lib/navigation/compose-sidebar-groups";
import { isCustomerShellRole, toNavUser } from "@/lib/navigation/registry-resolver";
import {
  NAV_GROUPS_BY_ROLE,
  type NavGroup,
  type NavItem,
} from "@/components/dashboard/sidebar-nav-groups";

export const DASHBOARD_NAV_CAPABILITY_CACHE_MS = 30 * 60_000;

const NAV_FEATURE_GATES: Array<{ prefix: string; feature: EntitlementFeatureKey }> = [
  { prefix: "/company/assessments", feature: "assessments" },
  { prefix: "/recruit/assessments", feature: "assessments" },
  { prefix: "/company/offers", feature: "offers" },
  { prefix: "/recruit/offers", feature: "offers" },
];

function featureForHref(href: string): EntitlementFeatureKey | null {
  return NAV_FEATURE_GATES.find((x) => href.startsWith(x.prefix))?.feature ?? null;
}

/** True if this nav href should be considered "on this route" (exact or nested under multi-segment paths). */
export function navHrefMatchesPathname(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/") return false;
  const segments = href.split("/").filter(Boolean);
  if (segments.length <= 1) return false;
  return pathname.startsWith(`${href}/`);
}

export function getNavHrefs(items: NavItem[]): string[] {
  const hrefs: string[] = [];
  for (const item of items) {
    hrefs.push(item.href);
    if (item.children) {
      for (const child of item.children) hrefs.push(child.href);
    }
  }
  return hrefs;
}

/** Single most-specific matching nav href so only one row/top item highlights. */
export function getActiveNavHref(pathname: string, hrefs: string[]): string | null {
  const matches = hrefs.filter((href) => navHrefMatchesPathname(pathname, href));
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.length - a.length || b.localeCompare(a));
  return matches[0] ?? null;
}

export function useDashboardNavGroups() {
  const { user, loading } = useAuth();
  const { data: entitlementsData } = useApiQuery<{
    features?: Partial<Record<EntitlementFeatureKey, boolean>>;
  }>(user?.organisationId ? "/api/entitlements" : null, undefined, {
    cacheTtlMs: DASHBOARD_NAV_CAPABILITY_CACHE_MS,
    persistToSessionStorage: true,
  });
  const { data: enterpriseCap } = useApiQuery<{ finance?: boolean; canCreateOffers?: boolean }>(
    user && (user.role === "recruiter" || user.role === "hiring_manager")
      ? "/api/me/enterprise-capabilities"
      : null,
    undefined,
    { cacheTtlMs: DASHBOARD_NAV_CAPABILITY_CACHE_MS, persistToSessionStorage: true },
  );
  const navGroups = useMemo(() => {
    if (!user) return [];
    const features = entitlementsData?.features;

    if (isCustomerShellRole(user.role)) {
      const navUser = toNavUser(user);
      let groups = composeSidebarGroupsForRole({
        role: user.role,
        user: navUser,
        features,
        omitEntryIds:
          user.role === "hiring_manager" && enterpriseCap?.canCreateOffers !== true
            ? ["jobs.offers_draft"]
            : undefined,
        appendToWorkflowGroup:
          enterpriseCap?.finance && (user.role === "recruiter" || user.role === "hiring_manager")
            ? [
                {
                  label: "Finance Inbox",
                  href: "/company/finance",
                  icon: <DollarSign size={18} />,
                },
              ]
            : undefined,
      });
      return groups;
    }

    let groups = NAV_GROUPS_BY_ROLE[user.role] ?? [];
    groups = groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const req = featureForHref(item.href);
          if (!req) return true;
          return features?.[req] !== false;
        }),
      }))
      .filter((group) => group.items.length > 0);

    if (user.role === "hiring_manager" && enterpriseCap?.canCreateOffers !== true) {
      groups = groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => item.href !== "/company/offers/draft"),
        }))
        .filter((group) => group.items.length > 0);
    }

    if (enterpriseCap?.finance && (user.role === "recruiter" || user.role === "hiring_manager")) {
      groups = groups.map((group) => {
        if (group.label !== HIRING_WORKFLOW_GROUP_LABEL) return group;
        const hasFinance = group.items.some((item) => item.href === "/company/finance");
        if (hasFinance) return group;
        return {
          ...group,
          items: [
            ...group.items,
            {
              label: "Finance Inbox",
              href: "/company/finance",
              icon: <DollarSign size={18} />,
            },
          ],
        };
      });
    }

    return groups;
  }, [user, entitlementsData?.features, enterpriseCap?.finance, enterpriseCap?.canCreateOffers]);

  return { user, loading, navGroups, features: entitlementsData?.features };
}
