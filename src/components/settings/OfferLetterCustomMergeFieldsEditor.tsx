"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import type { OfferCustomMergeFieldDef } from "@/lib/offers/offer-custom-merge-fields";

type Row = OfferCustomMergeFieldDef;

function defsSignature(defs: Row[]) {
  return JSON.stringify(
    defs.map((d) => ({ key: d.key, label: d.label, description: d.description ?? "" })),
  );
}

export function OfferLetterCustomMergeFieldsEditor({
  templateId,
  initialDefs,
  onSaved,
}: {
  templateId: string;
  initialDefs: Row[];
  onSaved?: () => void | Promise<void>;
}) {
  const [rows, setRows] = useState<Row[]>(initialDefs);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const initialSig = defsSignature(initialDefs);
  useEffect(() => {
    setRows(initialDefs);
  }, [templateId, initialSig, initialDefs]);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, { key: "", label: "", description: "" }]);
  }, []);

  const removeRow = useCallback((index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateRow = useCallback((index: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }, []);

  async function save() {
    setSaving(true);
    setNotice(null);
    setSaveError(null);
    const normalized: Row[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      const key = r.key.trim().toLowerCase().replace(/\s+/g, "_");
      const label = r.label.trim();
      if (!key && !label && !(r.description ?? "").trim()) continue;
      if (!key || !label) {
        setSaveError("Each custom field needs both a key (snake_case) and a label.");
        setSaving(false);
        return;
      }
      if (!/^[a-z][a-z0-9_]{0,62}$/.test(key)) {
        setSaveError(
          `Invalid key "${key}". Use lowercase letters, digits, and underscores; start with a letter.`,
        );
        setSaving(false);
        return;
      }
      if (seen.has(key)) {
        setSaveError(`Duplicate key "${key}".`);
        setSaving(false);
        return;
      }
      seen.add(key);
      const desc = (r.description ?? "").trim();
      normalized.push({
        key,
        label,
        ...(desc ? { description: desc } : {}),
      });
    }

    try {
      const res = await fetch(`/api/offer-pdf-templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ customMergeFieldDefs: normalized }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSaveError(json.error ?? "Could not save custom fields.");
        return;
      }
      setNotice(
        "Custom merge fields saved. Use {{key}} in the letter body and fill values when creating an offer.",
      );
      await onSaved?.();
    } catch {
      setSaveError("Could not save custom fields.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-4">
      <h3 className="text-sm font-semibold text-[var(--text)]">Custom merge fields</h3>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Define extra placeholders (e.g.{" "}
        <code className="text-[var(--text)]">{"{{work_location}}"}</code>
        ). They cannot reuse built-in names like{" "}
        <code className="text-[var(--text)]">candidate_name</code>. Recruiters fill values when
        creating a draft offer.
      </p>

      <div className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">No custom fields yet.</p>
        ) : (
          rows.map((row, index) => (
            <div
              key={`${index}-${row.key}`}
              className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 p-2 sm:grid-cols-[1fr_1.2fr_1fr_auto]"
            >
              <input
                className="rounded-md border border-[var(--border)] bg-[var(--surface)]/50 px-2 py-1.5 text-xs text-[var(--text)]"
                placeholder="key_snake_case"
                value={row.key}
                onChange={(e) => updateRow(index, { key: e.target.value })}
              />
              <input
                className="rounded-md border border-[var(--border)] bg-[var(--surface)]/50 px-2 py-1.5 text-xs text-[var(--text)]"
                placeholder="Label (shown in UI)"
                value={row.label}
                onChange={(e) => updateRow(index, { label: e.target.value })}
              />
              <input
                className="rounded-md border border-[var(--border)] bg-[var(--surface)]/50 px-2 py-1.5 text-xs text-[var(--text)]"
                placeholder="Hint (optional)"
                value={row.description ?? ""}
                onChange={(e) => updateRow(index, { description: e.target.value })}
              />
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="inline-flex rounded-md border border-[var(--border)] p-1.5 text-[var(--text-muted)] hover:border-red-500/50 hover:text-red-400"
                  title="Remove row"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--surface)]"
        >
          <Plus size={14} />
          Add field
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-contrast)] disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save custom fields
        </button>
      </div>

      {notice ? <p className="mt-2 text-xs text-emerald-400">{notice}</p> : null}
      {saveError ? <p className="mt-2 text-xs text-red-400">{saveError}</p> : null}
    </div>
  );
}
