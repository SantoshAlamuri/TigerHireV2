"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { SettingsReadOnlyBanner } from "@/components/settings/SettingsReadOnlyBanner";
import { canEditOrgHiringSettings } from "@/lib/settings/org-hiring-settings-auth";

type SettingsEditableFormProps = {
  children: ReactNode;
  className?: string;
};

/** Wraps org hiring-config settings forms: read-only banner + disabled fieldset for non–org-admins. */
export function SettingsEditableForm({ children, className }: SettingsEditableFormProps) {
  const { user } = useAuth();
  const canEdit = canEditOrgHiringSettings(user);

  return (
    <div className={className}>
      {!canEdit ? <SettingsReadOnlyBanner /> : null}
      <fieldset
        disabled={!canEdit}
        className={
          !canEdit
            ? "mt-4 min-w-0 space-y-6 border-0 p-0 opacity-60 [&_*]:cursor-not-allowed"
            : "min-w-0 space-y-6 border-0 p-0"
        }
      >
        {children}
      </fieldset>
    </div>
  );
}
