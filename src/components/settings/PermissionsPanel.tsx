"use client";

import { ShieldCheck, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { PermissionsSettingsInput } from "@/lib/validations/integrations";

const PERMISSION_FIELDS: Array<{
  key: keyof PermissionsSettingsInput;
  role: string;
  label: string;
  description: string;
}> = [
  {
    key: "recruiterCanManageIntegrations",
    role: "Recruiter",
    label: "Manage integrations",
    description: "Allow recruiters to edit organisation integrations.",
  },
  {
    key: "recruiterCanManagePrivacy",
    role: "Recruiter",
    label: "Manage privacy settings",
    description: "Allow recruiters to edit consent/retention policy.",
  },
  {
    key: "recruiterCanReadAudit",
    role: "Recruiter",
    label: "Read audit log",
    description: "Allow recruiters to view audit events.",
  },
  {
    key: "hiringManagerCanViewSettings",
    role: "Hiring Manager",
    label: "View settings",
    description: "Allow hiring managers to view settings pages.",
  },
  {
    key: "hiringManagerCanReadAudit",
    role: "Hiring Manager",
    label: "Read audit log",
    description: "Allow hiring managers to view audit events.",
  },
  {
    key: "recruiterCanCreateOffers",
    role: "Recruiter",
    label: "Create offers",
    description: "Allow recruiters to create offers.",
  },
  {
    key: "hiringManagerCanCreateOffers",
    role: "Hiring Manager",
    label: "Create offers",
    description: "Allow assigned hiring managers to initiate offer drafts.",
  },
  {
    key: "recruiterCanCreateAssessments",
    role: "Recruiter",
    label: "Create assessments/tests",
    description: "Allow recruiters to create assessments and tests.",
  },
  {
    key: "hiringManagerCanCreateAssessments",
    role: "Hiring Manager",
    label: "Create assessments/tests",
    description: "Allow hiring managers to create assessments and tests.",
  },
  {
    key: "recruiterCanManageAssessmentTemplates",
    role: "Recruiter",
    label: "Manage assessment templates",
    description: "Allow recruiters to create/update organisation assessment templates.",
  },
  {
    key: "hiringManagerCanManageAssessmentTemplates",
    role: "Hiring Manager",
    label: "Manage assessment templates",
    description: "Allow hiring managers to create/update organisation assessment templates.",
  },
];

export function PermissionsPanel({
  initialValues,
  onSave,
}: {
  initialValues: PermissionsSettingsInput;
  onSave: (values: PermissionsSettingsInput) => Promise<void>;
}) {
  const [values, setValues] = useState<PermissionsSettingsInput>(initialValues);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-6">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
        <ShieldCheck size={16} />
        Role permissions
      </h3>
      <p className="mb-4 text-xs text-[var(--text-muted)]">
        Company Admin remains the owner role. Toggle controlled access for recruiters and hiring
        managers.
      </p>
      <div className="space-y-3">
        {PERMISSION_FIELDS.map((row) => (
          <div
            key={`${row.role}-${row.key}`}
            className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3"
          >
            <div>
              <p className="text-sm text-[var(--text)]">
                {row.role}: {row.label}
              </p>
              <p className="text-xs text-[var(--text-muted)]">{row.description}</p>
            </div>
            <button
              type="button"
              onClick={() =>
                setValues((prev) => ({
                  ...prev,
                  [row.key]: !prev[row.key],
                }))
              }
              className={`rounded-full px-3 py-1 text-xs ${
                values[row.key]
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-slate-500/20 text-slate-300"
              }`}
            >
              {values[row.key] ? "Enabled" : "Disabled"}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
        <p className="text-sm font-medium text-[var(--text)]">Requisition advanced mode</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Keep this disabled for a simple default flow (Create - Submit - Approve - Convert). Enable
          only when admins need advanced requisition controls like custom workflow templates and
          delegations.
        </p>
        <button
          type="button"
          onClick={() =>
            setValues((prev) => ({
              ...prev,
              requisitionAdvancedMode: !(prev.requisitionAdvancedMode ?? false),
            }))
          }
          className={`mt-3 rounded-full px-3 py-1 text-xs ${
            values.requisitionAdvancedMode
              ? "bg-emerald-500/20 text-emerald-300"
              : "bg-slate-500/20 text-slate-300"
          }`}
        >
          {values.requisitionAdvancedMode ? "Advanced mode enabled" : "Advanced mode disabled"}
        </button>
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
        {notice ? <p className="text-xs text-emerald-300">{notice}</p> : null}
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            setNotice(null);
            setError(null);
            try {
              await onSave(values);
              setNotice("Permissions saved");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to save permissions");
            } finally {
              setSaving(false);
            }
          }}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          Save permissions
        </button>
      </div>
    </section>
  );
}
