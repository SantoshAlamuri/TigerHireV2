import { createElement } from "react";
import type { NavGroup, NavItem } from "@/components/dashboard/sidebar-nav-groups";
import type { EntitlementFeatureKey } from "@/lib/entitlements/config";
import { DEFAULT_NAV_ICON, NAV_ENTRY_ICONS } from "@/lib/navigation/nav-entry-icons";
import {
  getEntryById,
  passesEntitlementGate,
  resolveNavEntryLabel,
  resolveNavEntryPath,
} from "@/lib/navigation/registry-helpers";
import type { NavUser } from "@/lib/navigation/registry";
import { getPlanDocumentOmittedSidebarEntryIds } from "@/lib/navigation/plan-document-nav-filter";
import { NAV_GROUP_STRUCTURE_BY_ROLE } from "@/lib/navigation/sidebar-group-structure";
import { HIRING_WORKFLOW_GROUP_LABEL } from "@/lib/navigation/sidebar-workflow";
import type { UserRole } from "@/types/database";

export type ComposeSidebarGroupsOptions = {
  role: UserRole;
  user: NavUser;
  features?: Partial<Record<EntitlementFeatureKey, boolean>>;
  /** Extra items appended to the hiring workflow group (e.g. finance inbox for enterprise recruiters). */
  appendToWorkflowGroup?: NavItem[];
  /** Remove draft offers when HM cannot create offers. */
  omitEntryIds?: string[];
};

function registryEntryToNavItem(
  entryId: string,
  user: NavUser,
  features?: Partial<Record<EntitlementFeatureKey, boolean>>,
): NavItem | null {
  const entry = getEntryById(entryId);
  if (!entry || !entry.visibleTo(user)) return null;
  if (!passesEntitlementGate(entry, features)) return null;
  const href = resolveNavEntryPath(entry, user);
  if (!href) return null;
  const Icon = NAV_ENTRY_ICONS[entryId] ?? DEFAULT_NAV_ICON;
  return {
    label: resolveNavEntryLabel(entry, user),
    href,
    icon: createElement(Icon, { size: 18 }),
  };
}

export function composeSidebarGroupsForRole(options: ComposeSidebarGroupsOptions): NavGroup[] {
  const { role, user, features, appendToWorkflowGroup, omitEntryIds } = options;
  const templates = NAV_GROUP_STRUCTURE_BY_ROLE[role];
  if (!templates) return [];

  const omit = new Set([...getPlanDocumentOmittedSidebarEntryIds(role), ...(omitEntryIds ?? [])]);
  const groups: NavGroup[] = [];

  for (const template of templates) {
    const items: NavItem[] = [];
    for (const entryId of template.entryIds) {
      if (omit.has(entryId)) continue;
      const item = registryEntryToNavItem(entryId, user, features);
      if (item) items.push(item);
    }
    if (items.length === 0) continue;
    groups.push({
      label: template.label,
      items,
      subtle: template.subtle,
      autoHide: template.autoHide,
    });
  }

  if (appendToWorkflowGroup && appendToWorkflowGroup.length > 0) {
    const workflow = groups.find((g) => g.label === HIRING_WORKFLOW_GROUP_LABEL);
    if (workflow) {
      const existing = new Set(workflow.items.map((i) => i.href));
      workflow.items = [
        ...workflow.items,
        ...appendToWorkflowGroup.filter((i) => !existing.has(i.href)),
      ];
    }
  }

  return groups.filter((g) => g.items.length > 0);
}
