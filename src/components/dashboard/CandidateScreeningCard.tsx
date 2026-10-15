"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";

type ScreeningJob = {
  id: string;
  req_id: string;
  mode: "voice" | "whatsapp" | "manual" | "none";
  status: string;
  recommendation: "shortlist" | "reject" | "review" | "no_data" | null;
  summary_json: {
    notice_period_days: number | null;
    current_ctc_lakhs: number | null;
    expected_ctc_lakhs: number | null;
    english_fluency: string;
    confidence_signal: string;
    recommendation_reason: string;
    key_quote: string;
  } | null;
  created_at: string;
};

function formatMode(mode: ScreeningJob["mode"]): string {
  if (mode === "voice") return "Voice";
  if (mode === "whatsapp") return "WhatsApp";
  if (mode === "manual") return "Manual";
  return "None";
}

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

export function CandidateScreeningCard({
  candidateId,
  reqId,
  canOverride = true,
}: {
  candidateId: string;
  reqId?: string;
  canOverride?: boolean;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [addNoteLoading, setAddNoteLoading] = useState(false);
  const query = useMemo(
    () => ({
      candidateId,
      ...(reqId ? { reqId } : {}),
      limit: 5,
    }),
    [candidateId, reqId],
  );
  const { data, loading } = useApiQuery<{ jobs: ScreeningJob[] }>(
    candidateId ? "/api/screening/jobs" : null,
    query,
  );

  const latest = data?.jobs?.[0] ?? null;
  const latestWithSummary = data?.jobs?.find((job) => Boolean(job.summary_json)) ?? null;
  const summaryJob = latest?.summary_json ? latest : latestWithSummary;

  async function addSummaryToNotes() {
    if (!summaryJob?.summary_json) return;
    if (addNoteLoading) return;

    const summary = summaryJob.summary_json;
    const recommendation = summaryJob.recommendation ?? "no_data";
    const reason =
      summary.recommendation_reason || summary.key_quote || "No additional summary provided.";
    const noteBody = [
      "[Screening read]",
      `Mode: ${formatMode(summaryJob.mode)}`,
      `Status: ${formatStatus(summaryJob.status)}`,
      `Recommendation: ${recommendation}`,
      `Notice period: ${summary.notice_period_days ?? "—"} days`,
      `CTC: ₹${summary.current_ctc_lakhs ?? "—"}L -> ₹${summary.expected_ctc_lakhs ?? "—"}L`,
      `Summary: ${reason}`,
      "Next step: Recruiter review and proceed with interview/closure decision.",
    ].join("\n");

    setAddNoteLoading(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/candidates/${candidateId}/notes`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: noteBody,
          ...(reqId ? { jobId: reqId } : summaryJob.req_id ? { jobId: summaryJob.req_id } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setNotice(payload.error ?? "Failed to add screening summary to notes.");
        return;
      }
      setNotice("Screening summary added to notes for next steps.");
    } finally {
      setAddNoteLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4 text-sm text-white/65">
        <Loader2 size={14} className="mr-2 inline animate-spin" />
        Loading screening…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Screening</p>

      {!latest ? (
        <p className="mt-2 text-sm text-white/70">Not started yet.</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/60">
            <span className="rounded-full border border-[var(--border)] px-2 py-0.5">
              {formatMode(latest.mode)} mode
            </span>
            <span>{formatStatus(latest.status)}</span>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">
              Screening read
            </span>
          </div>
          {summaryJob?.summary_json ? (
            <div className="mt-3 space-y-1 text-sm text-white/75">
              {latest && summaryJob.id !== latest.id ? (
                <p className="text-xs text-white/55">
                  Showing the latest completed screening summary while the current run is in
                  progress.
                </p>
              ) : null}
              <p>
                Notice:{" "}
                <span className="font-medium text-[var(--text)]">
                  {summaryJob.summary_json.notice_period_days ?? "—"} days
                </span>
              </p>
              <p>
                CTC:{" "}
                <span className="font-medium text-[var(--text)]">
                  ₹{summaryJob.summary_json.current_ctc_lakhs ?? "—"}L → ₹
                  {summaryJob.summary_json.expected_ctc_lakhs ?? "—"}L
                </span>
              </p>
              <p>
                Recommendation:{" "}
                <span className="font-medium text-[var(--text)]">
                  {summaryJob.recommendation ?? "no_data"}
                </span>
              </p>
              <p className="text-xs text-white/60">
                {summaryJob.summary_json.recommendation_reason || summaryJob.summary_json.key_quote}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-white/70">Summary not available yet.</p>
          )}
        </>
      )}

      {canOverride && summaryJob?.summary_json ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => void addSummaryToNotes()}
            disabled={addNoteLoading}
            className="rounded-md border border-[var(--border-interactive)] px-2.5 py-1 text-xs text-white/80 disabled:opacity-50"
          >
            {addNoteLoading ? "Adding…" : "Add screening summary to notes"}
          </button>
        </div>
      ) : null}

      {notice ? <p className="mt-2 text-xs text-white/65">{notice}</p> : null}
    </div>
  );
}
