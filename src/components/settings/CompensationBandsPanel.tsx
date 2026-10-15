"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { SettingsEditableForm } from "@/components/settings/SettingsEditableForm";
import { canEditOrgHiringSettings } from "@/lib/settings/org-hiring-settings-auth";

type BandRow = {
  id: string;
  label: string;
  currency: string;
  min_amount: number;
  max_amount: number;
  is_active: boolean;
};

export function CompensationBandsPanel() {
  const { user } = useAuth();
  const canEdit = canEditOrgHiringSettings(user);
  const { data, loading, error, refetch } = useApiQuery<{ bands: BandRow[] }>(
    "/api/compensation-bands?all=1",
  );

  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ label: "", currency: "INR", minAmount: "", maxAmount: "" });
  const [creating, setCreating] = useState(false);

  const bands = data?.bands ?? [];

  const clearMessages = useCallback(() => {
    setNotice(null);
    setSaveError(null);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  async function createBand() {
    if (!canEdit) return;
    clearMessages();
    const minAmount = Number(draft.minAmount);
    const maxAmount = Number(draft.maxAmount);
    if (!draft.label.trim() || !Number.isFinite(minAmount) || !Number.isFinite(maxAmount)) {
      setSaveError("Label, min, and max are required.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/compensation-bands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          label: draft.label.trim(),
          currency: draft.currency.trim().toUpperCase().slice(0, 3),
          minAmount,
          maxAmount,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSaveError(json.error ?? "Could not create band.");
        return;
      }
      setDraft({ label: "", currency: "INR", minAmount: "", maxAmount: "" });
      setNotice("Band created.");
      await refetch();
    } finally {
      setCreating(false);
    }
  }

  async function patchBand(id: string, patch: Record<string, unknown>) {
    clearMessages();
    const res = await fetch(`/api/compensation-bands/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(patch),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setSaveError(json.error ?? "Update failed.");
      return;
    }
    setNotice("Saved.");
    await refetch();
  }

  async function softDelete(id: string) {
    clearMessages();
    const res = await fetch(`/api/compensation-bands/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setSaveError(json.error ?? "Could not deactivate band.");
      return;
    }
    setNotice("Band deactivated.");
    await refetch();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-[var(--text)]">
          Compensation bands
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Define CTC ranges for offer validation. Use <strong>full annual amounts</strong> in the
          band currency (e.g. INR <code className="text-[var(--text)]">2400000</code> for about 24
          LPA), matching the recruiter CTC calculator and{" "}
          <code className="text-[var(--text)]">ctc</code> on the offer. Exceptions route for
          approval before send.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      ) : null}
      {saveError ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {saveError}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {notice}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 size={16} className="animate-spin" />
          Loading bands...
        </div>
      ) : null}

      {!loading ? (
        <SettingsEditableForm>
          {!loading && bands.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              No bands yet. {canEdit ? "Add one below." : ""}
            </p>
          ) : null}

          {bands.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-[var(--border)] bg-[var(--bg-elevated)]/40 text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Label</th>
                    <th className="px-3 py-2">Currency</th>
                    <th className="px-3 py-2">Min</th>
                    <th className="px-3 py-2">Max</th>
                    <th className="px-3 py-2">Active</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {bands.map((b) => (
                    <BandEditorRow
                      key={b.id}
                      band={b}
                      canEdit={canEdit}
                      onPatch={patchBand}
                      onDeactivate={softDelete}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {canEdit ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/30 p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                New band
              </p>
              <div className="flex flex-wrap gap-3">
                <input
                  className="min-w-[8rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
                  placeholder="Label (e.g. IC3)"
                  value={draft.label}
                  onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                />
                <input
                  className="w-20 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm uppercase text-[var(--text)]"
                  placeholder="INR"
                  maxLength={3}
                  value={draft.currency}
                  onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value }))}
                />
                <input
                  className="w-36 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
                  placeholder="Min (annual)"
                  type="number"
                  title="Minimum annual CTC in band currency"
                  value={draft.minAmount}
                  onChange={(e) => setDraft((d) => ({ ...d, minAmount: e.target.value }))}
                />
                <input
                  className="w-36 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
                  placeholder="Max (annual)"
                  type="number"
                  title="Maximum annual CTC in band currency"
                  value={draft.maxAmount}
                  onChange={(e) => setDraft((d) => ({ ...d, maxAmount: e.target.value }))}
                />
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => void createBand()}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-black disabled:opacity-50"
                >
                  {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Add
                </button>
              </div>
            </div>
          ) : null}
        </SettingsEditableForm>
      ) : null}
    </div>
  );
}

function BandEditorRow({
  band,
  canEdit,
  onPatch,
  onDeactivate,
}: {
  band: BandRow;
  canEdit: boolean;
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onDeactivate: (id: string) => Promise<void>;
}) {
  const [label, setLabel] = useState(band.label);
  const [currency, setCurrency] = useState(band.currency);
  const [minAmount, setMinAmount] = useState(String(band.min_amount));
  const [maxAmount, setMaxAmount] = useState(String(band.max_amount));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLabel(band.label);
    setCurrency(band.currency);
    setMinAmount(String(band.min_amount));
    setMaxAmount(String(band.max_amount));
  }, [band]);

  async function save() {
    if (!canEdit) return;
    const minV = Number(minAmount);
    const maxV = Number(maxAmount);
    if (!Number.isFinite(minV) || !Number.isFinite(maxV)) return;
    setSaving(true);
    try {
      await onPatch(band.id, {
        label: label.trim(),
        currency: currency.trim().toUpperCase().slice(0, 3),
        minAmount: minV,
        maxAmount: maxV,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-b border-[var(--border)] last:border-0">
      <td className="px-3 py-2">
        <input
          disabled={!canEdit}
          className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-[var(--text)] disabled:opacity-60"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => void save()}
        />
      </td>
      <td className="px-3 py-2">
        <input
          disabled={!canEdit}
          className="w-14 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs uppercase"
          maxLength={3}
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          onBlur={() => void save()}
        />
      </td>
      <td className="px-3 py-2">
        <input
          disabled={!canEdit}
          type="number"
          className="w-full max-w-[8rem] rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
          value={minAmount}
          onChange={(e) => setMinAmount(e.target.value)}
          onBlur={() => void save()}
        />
      </td>
      <td className="px-3 py-2">
        <input
          disabled={!canEdit}
          type="number"
          className="w-full max-w-[8rem] rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
          value={maxAmount}
          onChange={(e) => setMaxAmount(e.target.value)}
          onBlur={() => void save()}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          disabled={!canEdit}
          checked={band.is_active}
          onChange={(e) => void onPatch(band.id, { isActive: e.target.checked })}
        />
      </td>
      <td className="px-3 py-2 text-right">
        {canEdit && band.is_active ? (
          <button
            type="button"
            title="Deactivate"
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-red-400"
            onClick={() => void onDeactivate(band.id)}
          >
            <Trash2 size={16} />
          </button>
        ) : null}
        {saving ? <Loader2 size={14} className="ml-2 inline animate-spin opacity-60" /> : null}
      </td>
    </tr>
  );
}
