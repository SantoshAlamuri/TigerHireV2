"use client";

import { useState } from "react";
import { buildCsrfHeaders } from "@/lib/security/csrf-client";

/**
 * The actual first day, recorded against a hire.
 *
 * Day-90 referral bonuses count from here — deliberately not from `hired_at`,
 * which a trigger stamps the moment a recruiter marks the hire, often weeks
 * before the person walks in and sometimes for someone who never does. Left
 * blank the bonus is simply not due, which is the honest state: the alternative
 * is paying ninety days from a date nobody verified.
 *
 * Clearing the field is allowed on purpose — a wrong date should be removable
 * rather than corrected into another wrong date.
 */
export function JoiningDateField({
  pipelineCandidateId,
  joinedAt,
  onSaved,
}: {
  pipelineCandidateId: string;
  joinedAt: string | null;
  onSaved?: (next: string | null) => void;
}) {
  const initial = joinedAt ? joinedAt.slice(0, 10) : "";
  const [value, setValue] = useState(initial);
  // What the server currently holds. Tracked in state rather than read from the
  // `joinedAt` prop, which does not refresh after a save: comparing against the
  // stale prop made clearing a just-entered date a no-op — the input emptied and
  // the caption flipped to "not set" while the row still held the old date.
  const [savedValue, setSavedValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = value !== savedValue;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/pipeline/joining-date", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await buildCsrfHeaders()) },
        credentials: "include",
        body: JSON.stringify({
          pipeline_candidate_id: pipelineCandidateId,
          joined_at: value ? value : null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? "Could not save the joining date.");
        return;
      }
      setSavedValue(value);
      setSaved(true);
      onSaved?.(value ? value : null);
    } catch {
      setError("Could not save the joining date.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      data-no-card-nav="true"
      className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/50 p-3"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/60">
        Joining date
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          className="rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm text-[var(--text)]"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && !dirty ? <span className="text-xs text-emerald-300">Saved</span> : null}
      </div>
      {/* Describes what is stored, not what is typed — an unsaved edit must not
          read as though the bonus is already anchored. */}
      <p className="mt-2 text-[11px] text-white/45">
        {dirty
          ? "Not saved yet."
          : savedValue
            ? "Day-90 referral bonus becomes due 90 days from this date."
            : "Until this is set, a day-90 referral bonus for this hire never becomes due."}
      </p>
      {error ? <p className="mt-1 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
