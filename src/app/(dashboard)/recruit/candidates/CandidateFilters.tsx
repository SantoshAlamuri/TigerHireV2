"use client";

import { HIGH_INTENT, type Filters } from "@/lib/v2/candidate-filters";

/**
 * Function, location and intent filters — restored from the v1 list, which had
 * them and which this page replaces. A redesign that drops a filter a recruiter
 * uses daily is a downgrade, however much cleaner it looks.
 */
export function CandidateFilters({
  functions,
  locations,
  value,
  onChange,
  showing,
  total,
}: {
  functions: string[];
  locations: string[];
  value: Filters;
  onChange: (f: Filters) => void;
  showing: number;
  total: number;
}) {
  const select =
    "rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]";
  const active = value.fn || value.location || value.highIntentOnly;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <input
        aria-label="Filter by function"
        list="candidate-functions"
        placeholder="Role title (exact)"
        className={select}
        value={value.fn ?? ""}
        onChange={(e) => onChange({ ...value, fn: e.target.value || undefined })}
      />
      <datalist id="candidate-functions">
        {functions.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <input
        aria-label="Filter by location"
        list="candidate-locations"
        placeholder="Location (exact)"
        className={select}
        value={value.location ?? ""}
        onChange={(e) => onChange({ ...value, location: e.target.value || undefined })}
      />
      <datalist id="candidate-locations">
        {locations.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>

      <button
        type="button"
        onClick={() => onChange({ ...value, highIntentOnly: !value.highIntentOnly })}
        className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
          value.highIntentOnly
            ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
            : "border-[var(--border)] text-[var(--text-muted)]"
        }`}
        title={`Candidates scoring ${HIGH_INTENT} or above on intent. Unscored candidates are excluded — unknown is not low.`}
      >
        Intent signal
      </button>

      {active ? (
        <>
          <span className="text-xs text-[var(--text-muted)]">
            {showing} of {total}
          </span>
          <button
            type="button"
            onClick={() => onChange({})}
            className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Clear
          </button>
        </>
      ) : null}
    </div>
  );
}
