"use client";

import { useState } from "react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { REPORT_CARD_CLASS } from "./helpers";
import type { WhatsAppFlowStatusResponse } from "./types";

type LookupRow = {
  id: string;
  title?: string;
  name?: string;
  full_name?: string;
  email?: string;
  location?: string;
};

function RecordSearch({
  kind,
  onSelect,
}: {
  kind: "jobs" | "candidates";
  onSelect: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const { data, loading, error, refetch } = useApiQuery<{
    jobs?: LookupRow[];
    candidates?: LookupRow[];
  }>(search ? `/api/${kind}` : null, { search, limit: 10 });
  const rows = data?.[kind] ?? [];
  const label = kind === "jobs" ? "Job" : "Candidate";
  function find() {
    setSelectedId("");
    onSelect("");
    if (search === text.trim()) void refetch();
    else setSearch(text.trim());
  }
  return (
    <div className="space-y-2">
      <label className="block text-sm text-[var(--text-muted)]">
        {label} name
        <input
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && text.trim().length >= 2 && !loading) {
              event.preventDefault();
              find();
            }
          }}
          className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--border-interactive)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        />
      </label>
      <button
        type="button"
        disabled={text.trim().length < 2 || loading}
        onClick={find}
        className="rounded-[var(--radius-sm)] border border-[var(--border-interactive)] px-3 py-2 text-sm text-[var(--text)] disabled:opacity-50"
      >
        {loading ? "Searching…" : `Find ${label.toLowerCase()}`}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-300">
          Could not search. Try again.
        </p>
      ) : null}
      {search && !loading && !error && rows.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No matches.</p>
      ) : null}
      {!loading && !error && rows.length > 0 && (
        <label className="block text-sm text-[var(--text-muted)]">
          Choose {label.toLowerCase()} (up to 10 matches)
          <select
            key={search}
            value={selectedId}
            onChange={(event) => {
              setSelectedId(event.target.value);
              onSelect(event.target.value);
            }}
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--border-interactive)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
          >
            <option value="">Select {label.toLowerCase()}</option>
            {rows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.title ?? row.name ?? row.full_name ?? "Unnamed"}
                {row.location ? ` · ${row.location}` : row.email ? ` · ${row.email}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

export function FlowLookupSection() {
  const [flowLookupJobId, setFlowLookupJobId] = useState("");
  const [flowLookupCandidateId, setFlowLookupCandidateId] = useState("");
  const [flowLookupLoading, setFlowLookupLoading] = useState(false);
  const [flowLookupError, setFlowLookupError] = useState<string | null>(null);
  const [flowLookupData, setFlowLookupData] = useState<WhatsAppFlowStatusResponse | null>(null);

  async function handleFlowLookup() {
    const jobId = flowLookupJobId.trim();
    const candidateId = flowLookupCandidateId.trim();
    if (!jobId || !candidateId) {
      setFlowLookupError("Choose a job and candidate.");
      setFlowLookupData(null);
      return;
    }
    setFlowLookupLoading(true);
    setFlowLookupError(null);
    try {
      const response = await fetch(
        `/api/whatsapp/flow-status?jobId=${encodeURIComponent(jobId)}&candidateId=${encodeURIComponent(candidateId)}`,
        { credentials: "include", signal: AbortSignal.timeout(15000) },
      );
      const payload = (await response.json().catch(() => ({}))) as WhatsAppFlowStatusResponse & {
        error?: string;
      };
      if (!response.ok) {
        setFlowLookupError(payload.error ?? "Failed to load flow status.");
        setFlowLookupData(null);
        return;
      }
      setFlowLookupData(payload);
    } catch {
      setFlowLookupError("Failed to load flow status.");
      setFlowLookupData(null);
    } finally {
      setFlowLookupLoading(false);
    }
  }

  return (
    <section className={REPORT_CARD_CLASS}>
      <div className="mb-4">
        <h2 className="heading-section text-lg text-[var(--text)]">WhatsApp flow status</h2>
        <p className="mt-1 text-xs text-white/60">
          Find a job and candidate to check their screening progress.
        </p>
      </div>
      <fieldset disabled={flowLookupLoading}>
        <legend className="sr-only">Screening lookup</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <RecordSearch
            kind="jobs"
            onSelect={(id) => {
              setFlowLookupJobId(id);
              setFlowLookupData(null);
            }}
          />
          <RecordSearch
            kind="candidates"
            onSelect={(id) => {
              setFlowLookupCandidateId(id);
              setFlowLookupData(null);
            }}
          />
        </div>
        <details className="mt-4 text-sm text-[var(--text-muted)]">
          <summary className="cursor-pointer">Use exact IDs</summary>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-white/60">Job ID</span>
              <input
                value={flowLookupJobId}
                onChange={(event) => {
                  setFlowLookupJobId(event.target.value);
                  setFlowLookupData(null);
                }}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
                placeholder="job uuid"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-white/60">Candidate ID</span>
              <input
                value={flowLookupCandidateId}
                onChange={(event) => {
                  setFlowLookupCandidateId(event.target.value);
                  setFlowLookupData(null);
                }}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
                placeholder="candidate uuid"
              />
            </label>
          </div>
        </details>
      </fieldset>
      <button
        type="button"
        onClick={handleFlowLookup}
        disabled={flowLookupLoading || !flowLookupJobId || !flowLookupCandidateId}
        className="mt-3 rounded-[var(--radius-sm)] bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {flowLookupLoading ? "Checking..." : "Check flow status"}
      </button>
      {flowLookupError ? (
        <p className="mt-3 rounded-[var(--radius-sm)] border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {flowLookupError}
        </p>
      ) : null}
      {flowLookupData ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-white/60">
            WhatsApp opt-in:{" "}
            <span className="font-medium text-[var(--text)]">
              {flowLookupData.whatsappOptIn ? "Yes" : "No"}
            </span>
          </p>
          {flowLookupData.timeline.map((event) => (
            <div
              key={event.type}
              className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)]/60 px-3 py-2"
            >
              <p className="text-xs font-medium text-[var(--text)]">{event.label}</p>
              <p className="text-xs text-white/60">
                {event.status} {event.at ? `· ${new Date(event.at).toLocaleString()}` : ""}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
