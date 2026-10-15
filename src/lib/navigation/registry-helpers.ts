import type { EntitlementFeatureKey } from "@/lib/entitlements/config";
import { NAV_REGISTRY, type NavEntry, type NavUser } from "@/lib/navigation/registry";

export function resolveNavEntryPath(entry: NavEntry, user: NavUser): string | undefined {
  const resolved = entry.resolvePath?.(user) ?? entry.path;
  return resolved ?? undefined;
}

export function resolveNavEntryLabel(entry: NavEntry, user: NavUser): string {
  return entry.resolveLabel?.(user) ?? entry.label;
}

export function entryPassesNavChrome(entry: NavEntry): boolean {
  return entry.includeInNavChrome !== false;
}

export function passesEntitlementGate(
  entry: NavEntry,
  features: Partial<Record<EntitlementFeatureKey, boolean>> | undefined,
): boolean {
  const key = entry.requiresEntitlement;
  if (!key) return true;
  return features?.[key] !== false;
}

export function getEntryById(id: string): NavEntry | undefined {
  return NAV_REGISTRY.find((e) => e.id === id);
}

export function getChildren(parentId: string | null): NavEntry[] {
  return NAV_REGISTRY.filter((e) => e.parent === parentId).sort((a, b) => a.order - b.order);
}

export function getVisibleChildren(
  parentId: string | null,
  user: NavUser,
  opts?: { navChromeOnly?: boolean; features?: Partial<Record<EntitlementFeatureKey, boolean>> },
): NavEntry[] {
  return getChildren(parentId).filter((e) => {
    if (!e.visibleTo(user)) return false;
    if (opts?.navChromeOnly && !entryPassesNavChrome(e)) return false;
    if (opts?.features != null && !passesEntitlementGate(e, opts.features)) return false;
    return true;
  });
}

export function getAncestry(id: string): NavEntry[] {
  const chain: NavEntry[] = [];
  let current = getEntryById(id);
  const guard = new Set<string>();
  while (current) {
    if (guard.has(current.id)) {
      throw new Error(`NAV_REGISTRY: circular ancestry at "${current.id}"`);
    }
    guard.add(current.id);
    chain.unshift(current);
    current = current.parent ? getEntryById(current.parent) : undefined;
  }
  return chain;
}

export function getVisibleTopLevel(
  user: NavUser,
  opts?: { navChromeOnly?: boolean; features?: Partial<Record<EntitlementFeatureKey, boolean>> },
): NavEntry[] {
  return NAV_REGISTRY.filter((e) => {
    if (e.parent !== null || !e.visibleTo(user)) return false;
    if (opts?.navChromeOnly && !entryPassesNavChrome(e)) return false;
    if (opts?.features != null && !passesEntitlementGate(e, opts.features)) return false;
    return true;
  }).sort((a, b) => a.order - b.order);
}
