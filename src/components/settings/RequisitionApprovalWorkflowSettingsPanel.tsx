"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { SettingsEditableForm } from "@/components/settings/SettingsEditableForm";
import { useApiQuery } from "@/lib/hooks/use-api";
import { canEditOrgHiringSettings } from "@/lib/settings/org-hiring-settings-auth";
import { useAuth } from "@/lib/auth/AuthProvider";
import { DEFAULT_REQUISITION_APPROVAL_WORKFLOW_KEY } from "@/lib/workflows/requisition-approval-definitions";

type WorkflowOption = { key: string; label: string; description: string };
type WorkflowPayload = {
  requisitionApprovalWorkflowKey: string;
  options: WorkflowOption[];
};

export function RequisitionApprovalWorkflowSettingsPanel() {
  const { user } = useAuth();
  const canEdit = canEditOrgHiringSettings(user);
  const { data, loading, error, refetch } = useApiQuery<WorkflowPayload>(
    "/api/settings/requisition-approval-workflow",
  );
  const [value, setValue] = useState(DEFAULT_REQUISITION_APPROVAL_WORKFLOW_KEY);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (data?.requisitionApprovalWorkflowKey) {
      setValue(data.requisitionApprovalWorkflowKey);
    }
  }, [data?.requisitionApprovalWorkflowKey]);

  const options = data?.options ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text)]">Requisition approval workflow</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Choose how hiring requests move through Manager, HR, and Finance approvals.
        </p>
      </div>

      {loading ? <p className="text-sm text-[var(--text-muted)]">Loading…</p> : null}
      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      ) : null}

      {!loading && !error ? (
        <SettingsEditableForm>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <label
              htmlFor="requisition-workflow-select"
              className="block text-sm font-medium text-[var(--text)]"
            >
              Approval template
            </label>
            <select
              id="requisition-workflow-select"
              className="mt-2 w-full max-w-lg rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            >
              {options.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {options.find((o) => o.key === value)?.description ??
                "Manager, HR and Finance approvals with SLA tracking."}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {saveError ? <p className="text-xs text-red-300">{saveError}</p> : null}
              {notice ? <p className="text-xs text-emerald-300">{notice}</p> : null}
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  setNotice(null);
                  setSaveError(null);
                  try {
                    const response = await fetch("/api/settings/requisition-approval-workflow", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({ requisitionApprovalWorkflowKey: value }),
                    });
                    if (!response.ok) {
                      const payload = (await response.json()) as { error?: string };
                      throw new Error(payload.error || "Failed to save");
                    }
                    await refetch();
                    setNotice("Saved");
                  } catch (e) {
                    setSaveError(e instanceof Error ? e.message : "Failed to save");
                  } finally {
                    setSaving(false);
                  }
                }}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                Save template
              </button>
            </div>
          </div>
        </SettingsEditableForm>
      ) : null}
    </div>
  );
}
