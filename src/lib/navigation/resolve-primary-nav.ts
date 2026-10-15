import type { NavGroup } from "@/components/dashboard/sidebar-nav-groups";
import { getPrimaryNavHrefsForRole } from "@/lib/navigation/primary-nav-by-role";
import {
  isCustomerShellRole,
  resolveNavEntryForPath,
  toNavUser,
  type NavResolverUser,
} from "@/lib/navigation/registry-resolver";
import type { UserRole } from "@/types/database";
import type { User } from "@/types";

export type PrimaryNavEntry = {
  href: string;
  label: string;
  groupLabel: string;
};

function pathToGroupLabel(navGroups: NavGroup[], href: string): string {
  for (const group of navGroups) {
    for (const item of group.items) {
      if (item.href === href) return group.label;
      if (item.children?.some((c) => c.href === href)) return group.label;
    }
  }
  return "";
}

export function resolvePrimaryNavEntries(
  user: User,
  navGroups: NavGroup[],
  resolverUser: NavResolverUser,
): PrimaryNavEntry[] {
  const preferredHrefs = getPrimaryNavHrefsForRole(user.role);
  if (!isCustomerShellRole(user.role)) return [];

  return preferredHrefs
    .map((href) => {
      const resolved = resolveNavEntryForPath(href, resolverUser, { navChromeOnly: false });
      if (!resolved) return null;
      return {
        href: resolved.path,
        label: resolved.label,
        groupLabel: pathToGroupLabel(navGroups, href),
      };
    })
    .filter((item): item is PrimaryNavEntry => item != null);
}

export function buildNavResolverUser(
  user: User,
  features?: NavResolverUser["features"],
): NavResolverUser {
  return { ...toNavUser(user), features };
}

export function getPrimaryNavRoleOrder(role: UserRole): string[] {
  return getPrimaryNavHrefsForRole(role);
}
