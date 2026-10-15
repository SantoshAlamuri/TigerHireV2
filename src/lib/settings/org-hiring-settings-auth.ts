import type { User } from "@/types";

/** Org hiring-config settings (Brief 3 Phase 2): view for recruiters/leadership; edit for org admins. */
export function canEditOrgHiringSettings(
  user: Pick<User, "role" | "isOrgAdmin"> | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role === "super_admin") return true;
  return Boolean(user.isOrgAdmin);
}

export const ORG_HIRING_SETTINGS_READ_ONLY_HINT =
  "View only — organisation admins can edit these settings.";
