"use client";

import { useState } from "react";
import { Loader2, Sparkles, FileText, Video, ThumbsUp, AlertTriangle } from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";

type Signal = "strong" | "moderate" | "weak" | "not_assessed";

type InterviewSummary = {
  overall_recommendation: "advance" | "hold" | "reject" | "no_data";
  summary: string;
  strengths: string[];
  concerns: string[];
  competency_signals: { communication: Signal; technical: Signal; role_fit: Signal };
  notable_quotes: string[];
  follow_up_questions: string[];
};

type Recording = {
  id: string;
  status: "queued" | "joining" | "in_call" | "done" | "failed" | "no_show";
  recording_url: string | null;
  transcript_url: string | null;
  summary_json: InterviewSummary | null;
  duration_seconds: number | null;
  created_at: string;
};

const RECOMMENDATION_STYLE: Record<
  InterviewSummary["overall_recommendation"],
  { label: string; cls: string }
> = {
  advance: { label: "Advance", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  hold: { label: "Hold", cls: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  reject: { label: "Reject", cls: "border-red-500/30 bg-red-500/10 text-red-300" },
  no_data: {
    label: "No data",
    cls: "border-[var(--border)] bg-[var(--bg-elevated)] text-white/55",
  },
};

const SIGNAL_STYLE: Record<Signal, string> = {
  strong: "text-emerald-300",
  moderate: "text-amber-300",
  weak: "text-red-300",
  not_assessed: "text-white/45",
};

const IN_PROGRESS_LABEL: Partial<Record<Recording["status"], string>> = {
  queued: "Notetaker scheduled to join this interview",
  joining: "Notetaker is joining the call…",
  in_call: "Notetaker is recording the interview…",
};

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.round(seconds / 60);
  return `${mins} min`;
}

function SignalChip({ label, value }: { label: string; value: Signal }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs">
      <span className="text-white/55">{label}</span>
      <span className={`font-medium capitalize ${SIGNAL_STYLE[value]}`}>
        {value.replace("_", " ")}
      </span>
    </span>
  );
}

/**
 * AI Notetaker scorecard for a pipeline candidate. Renders nothing when no recording exists,
 * a status line while the bot is in progress, and the Claude interview scorecard once done.
 */
export function InterviewNotetakerCard({
  jobId,
  pipelineCandidateId,
}: {
  jobId?: string | null;
  pipelineCandidateId?: string | null;
}) {
  const { data, loading } = useApiQuery<{ recordings: Recording[] }>(
    jobId && pipelineCandidateId
      ? `/api/jobs/${jobId}/interviews/recordings?pipeline_candidate_id=${pipelineCandidateId}`
      : null,
  );
  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);

  const recordings = data?.recordings ?? [];
  if (!jobId || !pipelineCandidateId) return null;
  // Stay quiet until we know — never show an empty card for candidates without a notetaker.
  if (loading && recordings.length === 0) return null;
  if (recordings.length === 0) return null;

  const latest = recordings[0];
  const summary = latest.status === "done" ? latest.summary_json : null;
  const duration = formatDuration(latest.duration_seconds);

  return (
    <div className="card-lifted p-6 md:p-7">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="heading-section flex items-center gap-2 text-lg text-[var(--text)]">
          <Sparkles size={18} className="text-[var(--accent)]" />
          AI Notetaker
        </h3>
        {summary ? (
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${RECOMMENDATION_STYLE[summary.overall_recommendation].cls}`}
          >
            {RECOMMENDATION_STYLE[summary.overall_recommendation].label}
          </span>
        ) : null}
      </div>

      {/* In-progress / non-terminal states */}
      {!summary ? (
        <div className="flex items-center gap-2 text-sm text-white/65">
          {latest.status === "queued" ||
          latest.status === "joining" ||
          latest.status === "in_call" ? (
            <>
              <Loader2 size={14} className="animate-spin text-[var(--accent)]" />
              {IN_PROGRESS_LABEL[latest.status]}
            </>
          ) : latest.status === "no_show" ? (
            <span className="text-white/55">
              The notetaker couldn&apos;t join — no one admitted the bot.
            </span>
          ) : latest.status === "failed" ? (
            <span className="text-white/55">The notetaker run failed for this interview.</span>
          ) : (
            <span className="text-white/55">Processing the interview recording…</span>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {summary.summary ? (
            <p className="text-sm leading-relaxed text-white/80">{summary.summary}</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <SignalChip label="Communication" value={summary.competency_signals.communication} />
            <SignalChip label="Technical" value={summary.competency_signals.technical} />
            <SignalChip label="Role fit" value={summary.competency_signals.role_fit} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {summary.strengths.length > 0 ? (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-300/80">
                  <ThumbsUp size={12} /> Strengths
                </p>
                <ul className="space-y-1 text-sm text-white/75">
                  {summary.strengths.map((s, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-emerald-400/70">•</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {summary.concerns.length > 0 ? (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-300/80">
                  <AlertTriangle size={12} /> Concerns
                </p>
                <ul className="space-y-1 text-sm text-white/75">
                  {summary.concerns.map((c, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-amber-400/70">•</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {summary.notable_quotes.length > 0 ? (
            <div className="space-y-1.5">
              {summary.notable_quotes.map((q, i) => (
                <blockquote
                  key={i}
                  className="border-l-2 border-[var(--accent)]/40 pl-3 text-sm italic text-white/65"
                >
                  “{q}”
                </blockquote>
              ))}
            </div>
          ) : null}

          {summary.follow_up_questions.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-white/45">
                Suggested follow-ups
              </p>
              <ul className="space-y-1 text-sm text-white/75">
                {summary.follow_up_questions.map((q, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="text-white/40">{i + 1}.</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-4 border-t border-[var(--border)] pt-3 text-xs text-white/45">
            {duration ? <span>{duration} interview</span> : null}
            {latest.recording_url ? (
              <a
                href={latest.recording_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-white/65 hover:text-[var(--text)]"
              >
                <Video size={12} /> Recording
              </a>
            ) : null}
            {latest.transcript_url ? (
              <button
                type="button"
                onClick={async () => {
                  if (transcript !== null) {
                    setTranscript(null);
                    return;
                  }
                  setTranscriptLoading(true);
                  try {
                    const res = await fetch(
                      `/api/jobs/${jobId}/interviews/recordings/${latest.id}/transcript`,
                      { credentials: "include" },
                    );
                    setTranscript(res.ok ? await res.text() : "Couldn't load the transcript.");
                  } catch {
                    setTranscript("Couldn't load the transcript.");
                  } finally {
                    setTranscriptLoading(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 text-white/65 hover:text-[var(--text)]"
              >
                {transcriptLoading ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <FileText size={12} />
                )}
                {transcript !== null ? "Hide transcript" : "View transcript"}
              </button>
            ) : null}
          </div>
          {transcript !== null ? (
            <pre className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs text-white/75">
              {transcript}
            </pre>
          ) : null}
        </div>
      )}
    </div>
  );
}
