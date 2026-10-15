"use client";

import { useMemo, useState } from "react";
import { SettingsModule } from "@/components/settings/SettingsModule";
import { PrivacySettingsForm } from "@/components/settings/PrivacySettingsForm";
import { useApiQuery } from "@/lib/hooks/use-api";

interface PrivacyRow {
  consent_message: string;
  recording_retention_days: number;
  transcript_retention_days: number;
}

export default function CompanySettingsPrivacyPage() {
  const { data, loading, error, refetch } = useApiQuery<{ privacySettings: PrivacyRow }>(
    "/api/settings/privacy",
  );
  const [notice, setNotice] = useState<string | null>(null);

  const initial = useMemo(
    () => ({
      consentMessage:
        data?.privacySettings?.consent_message ??
        "This interview will be recorded and transcribed by TigerHire to help evaluate your application.",
      recordingRetentionDays: data?.privacySettings?.recording_retention_days ?? 90,
      transcriptRetentionDays: data?.privacySettings?.transcript_retention_days ?? 365,
    }),
    [data?.privacySettings],
  );

  return (
    <SettingsModule embedded title="Privacy" subtitle="Manage consent text and retention defaults">
      <div className="space-y-4">
        {loading ? <p className="text-sm text-white/60">Loading privacy settings...</p> : null}
        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            {notice}
          </p>
        ) : null}
        <PrivacySettingsForm
          initialValues={initial}
          onSave={async (values) => {
            const response = await fetch("/api/settings/privacy", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify(values),
            });
            if (!response.ok) {
              const payload = (await response.json()) as { error?: string };
              throw new Error(payload.error || "Failed to save privacy settings");
            }
            setNotice("Privacy settings saved");
            await refetch();
          }}
        />
      </div>
    </SettingsModule>
  );
}
