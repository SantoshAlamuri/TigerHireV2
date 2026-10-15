"use client";

import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { SettingsEditableForm } from "@/components/settings/SettingsEditableForm";
import { useApiQuery } from "@/lib/hooks/use-api";

type Template = {
  id: string;
  name: string;
  role_level?: string | null;
  department?: string | null;
  summary?: string | null;
  version?: number;
};

export function RequisitionTemplatesSettingsPanel() {
  const { data, loading, error, refetch } = useApiQuery<{ templates: Template[] }>(
    "/api/requisition-templates",
  );
  const [name, setName] = useState("");
  const [roleLevel, setRoleLevel] = useState("");
  const [department, setDepartment] = useState("");
  const [summary, setSummary] = useState("");
  const [templateText, setTemplateText] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text)]">Requisition templates</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Create and maintain reusable requisition/JD starter templates for hiring managers.
        </p>
      </div>

      <SettingsEditableForm>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <h3 className="text-sm font-semibold text-[var(--text)]">Create template</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Template name"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
            />
            <input
              value={roleLevel}
              onChange={(e) => setRoleLevel(e.target.value)}
              placeholder="Role level (e.g. L4)"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
            />
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Department"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
            />
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Summary"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
            />
          </div>
          <textarea
            value={templateText}
            onChange={(e) => setTemplateText(e.target.value)}
            rows={6}
            placeholder="Template text / starter JD content"
            className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
          />
          <div className="mt-3 flex items-center gap-3">
            {saveError ? <p className="text-xs text-red-300">{saveError}</p> : null}
            {notice ? <p className="text-xs text-emerald-300">{notice}</p> : null}
            <button
              type="button"
              disabled={saving || !name.trim()}
              onClick={async () => {
                setSaving(true);
                setSaveError(null);
                setNotice(null);
                try {
                  const res = await fetch("/api/requisition-templates", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                      name: name.trim(),
                      roleLevel: roleLevel.trim() || null,
                      department: department.trim() || null,
                      summary: summary.trim() || null,
                      templateText: templateText.trim() || null,
                    }),
                  });
                  const payload = await res.json();
                  if (!res.ok) throw new Error(payload.error ?? "Failed to create template");
                  setName("");
                  setRoleLevel("");
                  setDepartment("");
                  setSummary("");
                  setTemplateText("");
                  setNotice("Template created");
                  await refetch();
                } catch (e) {
                  setSaveError(e instanceof Error ? e.message : "Failed to create template");
                } finally {
                  setSaving(false);
                }
              }}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-black disabled:opacity-60"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Save template
            </button>
          </div>
        </div>
      </SettingsEditableForm>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text)]">Existing templates</h3>
        {loading ? <p className="mt-2 text-sm text-[var(--text-muted)]">Loading…</p> : null}
        {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
        <div className="mt-3 space-y-2">
          {(data?.templates ?? []).map((template) => (
            <div
              key={template.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            >
              <p className="text-sm font-medium text-[var(--text)]">{template.name}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {template.department || "Any department"} · {template.role_level || "Any level"} · v
                {template.version ?? 1}
              </p>
              {template.summary ? (
                <p className="mt-1 text-xs text-[var(--text-subtle)]">{template.summary}</p>
              ) : null}
            </div>
          ))}
          {!loading && (data?.templates?.length ?? 0) === 0 ? (
            <p className="text-xs text-[var(--text-subtle)]">No templates yet.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
