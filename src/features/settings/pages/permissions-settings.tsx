"use client";

import { useMemo } from "react";
import { SettingsModule } from "@/components/settings/SettingsModule";
import { PermissionsPanel } from "@/components/settings/PermissionsPanel";
import { useApiQuery } from "@/lib/hooks/use-api";
import type { PermissionsSettingsInput } from "@/lib/validations/integrations";

const DEFAULT_PERMISSIONS: PermissionsSettingsInput = {
  recruiterCanManageIntegrations: false,
  recruiterCanManagePrivacy: false,
  recruiterCanReadAudit: false,
  hiringManagerCanViewSettings: false,
  hiringManagerCanReadAudit: false,
  recruiterCanCreateOffers: true,
  hiringManagerCanCreateOffers: false,
  recruiterCanCreateAssessments: true,
  hiringManagerCanCreateAssessments: true,
  recruiterCanManageAssessmentTemplates: true,
  hiringManagerCanManageAssessmentTemplates: true,
  requisitionAdvancedMode: false,
};

export function PermissionsSettingsPageContent({ embedded = true }: { embedded?: boolean }) {
  const { data, loading, error, refetch } = useApiQuery<{ permissions: PermissionsSettingsInput }>(
    "/api/settings/permissions",
  );
  const initialValues = useMemo(
    () => ({
      ...DEFAULT_PERMISSIONS,
      ...(data?.permissions ?? {}),
    }),
    [data?.permissions],
  );

  return (
    <SettingsModule
      embedded={embedded}
      title="Permissions"
      subtitle="Role access controls for sensitive settings actions"
    >
      <div className="space-y-4">
        {loading ? <p className="text-sm text-white/60">Loading permissions...</p> : null}
        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        ) : null}
        <PermissionsPanel
          initialValues={initialValues}
          onSave={async (values) => {
            const response = await fetch("/api/settings/permissions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify(values),
            });
            if (!response.ok) {
              const payload = (await response.json()) as { error?: string };
              throw new Error(payload.error || "Failed to save permissions");
            }
            await refetch();
          }}
        />
      </div>
    </SettingsModule>
  );
}
