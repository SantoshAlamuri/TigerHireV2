"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { SettingsReadOnlyBanner } from "@/components/settings/SettingsReadOnlyBanner";
import { canEditOrgHiringSettings } from "@/lib/settings/org-hiring-settings-auth";
import { buildCsrfHeaders } from "@/lib/security/csrf-client";
import { PLAN_STAGE_TYPES, type PlanStageType } from "@/lib/recruitment-plan/types";
import type { OrgDefaultPlanStage } from "@/lib/recruitment-plan/org-default-plan-stages";
import { isPlanDocumentUiEnabled } from "@/lib/rollouts/plan-document-ui";

type Member = { id: string; full_name: string | null; email: string | null };

export function DefaultRecruitmentPlanPanel() {
  const { user } = useAuth();
  const canEdit = canEditOrgHiringSettings(user);
  const enabled = isPlanDocumentUiEnabled();
  const { data, loading, error, refetch } = useApiQuery<{
    stages: OrgDefaultPlanStage[];
    isCustom: boolean;
  }>(enabled ? "/api/org/recruitment-plan-defaults" : null);
  const { data: membersData } = useApiQuery<{ members: Member[] }>(
    enabled ? "/api/organisations/members" : null,
  );

  const [stages, setStages] = useState<OrgDefaultPlanStage[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (data?.stages) setStages(data.stages);
  }, [data?.stages]);

  const members = membersData?.members ?? [];

  const save = useCallback(async () => {
    if (!canEdit) return;
    setSaving(true);
    setSaveError(null);
    try {
      const csrf = await buildCsrfHeaders();
      const res = await fetch("/api/org/recruitment-plan-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...csrf },
        body: JSON.stringify({ stages }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Save failed");
      }
      await refetch();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [canEdit, stages, refetch]);

  if (!enabled) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Enable plan document mode to configure default recruitment plan stages.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <Loader2 className="animate-spin" size={16} /> Loading defaults…
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-muted)]">
        Stages copied into new recruitment plans when a job has no pipeline yet. Existing plans are
        not changed.
      </p>
      {!canEdit && <SettingsReadOnlyBanner />}
      <ul className="space-y-3">
        {stages.map((stage, index) => (
          <li
            key={`${stage.stage_order}-${index}`}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 p-4"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-xs text-[var(--text-muted)]">
                Stage name
                <input
                  type="text"
                  disabled={!canEdit}
                  value={stage.display_name}
                  onChange={(e) =>
                    setStages((prev) =>
                      prev.map((s, i) =>
                        i === index ? { ...s, display_name: e.target.value } : s,
                      ),
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs text-[var(--text-muted)]">
                Type
                <select
                  disabled={!canEdit}
                  value={stage.stage_type}
                  onChange={(e) =>
                    setStages((prev) =>
                      prev.map((s, i) =>
                        i === index ? { ...s, stage_type: e.target.value as PlanStageType } : s,
                      ),
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                >
                  {PLAN_STAGE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-[var(--text-muted)]">
                Target dwell (days)
                <input
                  type="number"
                  min={0}
                  max={365}
                  disabled={!canEdit}
                  value={stage.target_dwell_days}
                  onChange={(e) =>
                    setStages((prev) =>
                      prev.map((s, i) =>
                        i === index ? { ...s, target_dwell_days: Number(e.target.value) || 0 } : s,
                      ),
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs text-[var(--text-muted)]">
                Default interviewer
                <select
                  disabled={!canEdit}
                  value={stage.primary_interviewer_id ?? ""}
                  onChange={(e) =>
                    setStages((prev) =>
                      prev.map((s, i) =>
                        i === index
                          ? {
                              ...s,
                              primary_interviewer_id: e.target.value || null,
                            }
                          : s,
                      ),
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                >
                  <option value="">None</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name ?? m.email ?? m.id}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {canEdit && stages.length > 1 && (
              <button
                type="button"
                className="mt-3 inline-flex items-center gap-1 text-xs text-red-400"
                onClick={() => setStages((prev) => prev.filter((_, i) => i !== index))}
              >
                <Trash2 size={14} /> Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            onClick={() =>
              setStages((prev) => [
                ...prev,
                {
                  stage_order: prev.length,
                  stage_type: "interview",
                  display_name: "New stage",
                  target_dwell_days: 5,
                  primary_interviewer_id: null,
                },
              ])
            }
          >
            <Plus size={16} /> Add stage
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Save defaults
          </button>
        </div>
      )}
      {saveError && <p className="text-sm text-red-400">{saveError}</p>}
    </div>
  );
}
