import type { EntitlementFeatureKey } from "@/lib/entitlements/config";
import {
  NAV_REGISTRY,
  NAV_REGISTRY_CUSTOMER_ROLES,
  type NavEntry,
  type NavUser,
} from "@/lib/navigation/registry";
import {
  entryPassesNavChrome,
  passesEntitlementGate,
  resolveNavEntryLabel,
  resolveNavEntryPath,
} from "@/lib/navigation/registry-helpers";
import type { UserRole } from "@/types/database";

export interface NavEntryResolved {
  id: string;
  path: string;
  label: string;
  parentId?: string;
  includeInNavChrome: boolean;
}

export type NavResolverUser = NavUser & {
  features?: Partial<Record<EntitlementFeatureKey, boolean>>;
};

export type ResolveVisibleNavEntriesOptions = {
  registry?: NavEntry[];
  /** When true (default), omit entries with `includeInNavChrome === false`. */
  navChromeOnly?: boolean;
  features?: Partial<Record<EntitlementFeatureKey, boolean>>;
};

export function toNavUser(user: { role: UserRole; isOrgAdmin?: boolean }): NavUser {
  return { role: user.role, is_org_admin: Boolean(user.isOrgAdmin) };
}

function toResolved(
  entry: NavEntry,
  user: NavUser,
  features?: Partial<Record<EntitlementFeatureKey, boolean>>,
): NavEntryResolved | null {
  const path = resolveNavEntryPath(entry, user);
  if (!path) return null;
  return {
    id: entry.id,
    path,
    label: resolveNavEntryLabel(entry, user),
    parentId: entry.parent ?? undefined,
    includeInNavChrome: entryPassesNavChrome(entry),
  };
}

function entryIsVisible(
  entry: NavEntry,
  user: NavUser,
  opts: ResolveVisibleNavEntriesOptions,
): boolean {
  if (!entry.visibleTo(user)) return false;
  if (opts.navChromeOnly !== false && !entryPassesNavChrome(entry)) return false;
  if (!passesEntitlementGate(entry, opts.features)) return false;
  return resolveNavEntryPath(entry, user) != null;
}

/**
 * Returns registry entries visible to the user with a resolved path.
 * Top nav passes `navChromeOnly: false` so PRIMARY_NAV paths still resolve when
 * `includeInNavChrome` is false on child entries (e.g. offers, assessments).
 */
export function resolveVisibleNavEntries(
  user: NavResolverUser,
  options: ResolveVisibleNavEntriesOptions = {},
): NavEntryResolved[] {
  const registry = options.registry ?? NAV_REGISTRY;
  const navChromeOnly = options.navChromeOnly !== false;
  const opts = { ...options, navChromeOnly };
  const out: NavEntryResolved[] = [];

  for (const entry of registry) {
    if (!entryIsVisible(entry, user, opts)) continue;
    const resolved = toResolved(entry, user, opts.features);
    if (resolved) out.push(resolved);
  }

  return out.sort((a, b) => {
    const orderA = registry.find((e) => e.id === a.id)?.order ?? 0;
    const orderB = registry.find((e) => e.id === b.id)?.order ?? 0;
    return orderA - orderB || a.path.localeCompare(b.path);
  });
}

export function isNavEntryVisible(
  entryId: string,
  user: NavResolverUser,
  options: ResolveVisibleNavEntriesOptions = {},
): boolean {
  const entry = (options.registry ?? NAV_REGISTRY).find((e) => e.id === entryId);
  if (!entry) return false;
  return entryIsVisible(entry, user, { ...options, navChromeOnly: options.navChromeOnly ?? true });
}

/** First registry entry that resolves to `path` for this user (respects visibility + entitlements). */
export function resolveNavEntryForPath(
  path: string,
  user: NavResolverUser,
  options: Omit<ResolveVisibleNavEntriesOptions, "registry"> & { registry?: NavEntry[] } = {},
): NavEntryResolved | null {
  const registry = options.registry ?? NAV_REGISTRY;
  const navChromeOnly = options.navChromeOnly ?? false;
  const opts = { ...options, navChromeOnly };

  let resolvedViaAlias: NavEntryResolved | null = null;

  for (const entry of registry) {
    if (!entryIsVisible(entry, user, opts)) continue;
    const resolved = toResolved(entry, user, opts.features);
    if (resolved?.path !== path) continue;
    // Prefer literal `path` (e.g. workspace `/employee`) over `resolvePath` aliases
    // (e.g. referrals → `/employee` for employees) so top nav labels stay correct.
    if (entry.path === path) return resolved;
    resolvedViaAlias ??= resolved;
  }

  return resolvedViaAlias;
}

export function isCustomerShellRole(role: UserRole): boolean {
  return (NAV_REGISTRY_CUSTOMER_ROLES as readonly UserRole[]).includes(role);
}
