"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

type AccuracySignal = "accurate" | "too_low" | "too_high";
type FeedbackReason =
  | "skill_gap"
  | "experience_level_mismatch"
  | "location_constraint"
  | "salary_expectation_mismatch"
  | "domain_mismatch"
  | "cultural_fit_concern"
  | "role_filled_internally";

interface FitScoreFeedbackPromptProps {
  jobId: string;
  candidateId: string;
  fitScoreId: string;
  enabled: boolean;
}

const OPTION_STYLES: Record<AccuracySignal, string> = {
  accurate: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15",
  too_low: "border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/15",
  too_high: "border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15",
};

const REASON_OPTIONS: Array<{ value: FeedbackReason; label: string }> = [
  { value: "skill_gap", label: "Skill gap" },
  { value: "experience_level_mismatch", label: "Experience mismatch" },
  { value: "location_constraint", label: "Location constraint" },
  { value: "salary_expectation_mismatch", label: "Salary mismatch" },
  { value: "domain_mismatch", label: "Domain mismatch" },
  { value: "cultural_fit_concern", label: "Cultural fit concern" },
  { value: "role_filled_internally", label: "Role filled internally" },
];

export function FitScoreFeedbackPrompt({
  jobId,
  candidateId,
  fitScoreId,
  enabled,
}: FitScoreFeedbackPromptProps) {
  const [checking, setChecking] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [selected, setSelected] = useState<AccuracySignal | null>(null);
  const [reason, setReason] = useState<FeedbackReason | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSubmitIn, setAutoSubmitIn] = useState<number | null>(null);
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function checkExisting() {
      setChecking(true);
      try {
        const res = await fetch(
          `/api/fit-score/feedback?jobId=${encodeURIComponent(jobId)}&candidateId=${encodeURIComponent(candidateId)}`,
          { credentials: "include" },
        );
        const payload = (await res.json().catch(() => ({}))) as { hasFeedback?: boolean };
        if (!cancelled) setSubmitted(Boolean(payload.hasFeedback));
      } catch {
        if (!cancelled) setSubmitted(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    if (enabled) {
      void checkExisting();
    } else {
      setSubmitted(false);
      setChecking(false);
    }

    return () => {
      cancelled = true;
    };
  }, [candidateId, enabled, fitScoreId, jobId]);

  const submitFeedback = useCallback(async () => {
    if (!selected || submitting || submitted) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/fit-score/feedback", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          candidateId,
          fitScoreId,
          accuracy: selected,
          note: note.trim() ? note.trim().slice(0, 140) : undefined,
          reason: reason ?? undefined,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        if (res.status === 409) {
          setSubmitted(true);
          return;
        }
        setError(payload.error || "Could not submit feedback");
        return;
      }
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }, [selected, submitting, submitted, jobId, candidateId, fitScoreId, note, reason]);

  useEffect(() => {
    // No auto-submit while a submit is in flight or after a failed one —
    // re-arming on `submitting`/`error` changes would otherwise auto-retry.
    if (!selected || note.trim().length > 0 || submitted || !enabled || submitting || error) {
      if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      submitTimerRef.current = null;
      countdownTimerRef.current = null;
      setAutoSubmitIn(null);
      return;
    }

    setAutoSubmitIn(5);
    countdownTimerRef.current = setInterval(() => {
      setAutoSubmitIn((prev) => (prev != null && prev > 0 ? prev - 1 : prev));
    }, 1000);
    submitTimerRef.current = setTimeout(() => {
      void submitFeedback();
    }, 5000);

    return () => {
      if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [selected, note, submitted, enabled, submitting, error, submitFeedback]);

  const selectedLabel = useMemo(() => {
    if (selected === "accurate") return "Accurate";
    if (selected === "too_low") return "Scored too low";
    if (selected === "too_high") return "Scored too high";
    return "";
  }, [selected]);

  if (!enabled || checking || submitted) {
    return null;
  }

  return (
    <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/70 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        FitScore feedback
      </p>
      <p className="mt-1 text-sm text-[var(--text)]">
        Did the FitScore reflect this candidate accurately?
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={() => setSelected("accurate")}
          className={`rounded-full border px-3 py-2 text-sm font-medium transition ${OPTION_STYLES.accurate}`}
        >
          ✓ Accurate
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => setSelected("too_low")}
          className={`rounded-full border px-3 py-2 text-sm font-medium transition ${OPTION_STYLES.too_low}`}
        >
          ↑ Scored too low
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => setSelected("too_high")}
          className={`rounded-full border px-3 py-2 text-sm font-medium transition ${OPTION_STYLES.too_high}`}
        >
          ↓ Scored too high
        </button>
      </div>

      {selected ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-[var(--text-muted)]">
            Selected: <span className="text-[var(--text)]">{selectedLabel}</span>
          </p>
          <div className="space-y-1.5">
            <p className="text-xs text-[var(--text-muted)]">Optional reason</p>
            <div className="flex flex-wrap gap-1.5">
              {REASON_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setReason((prev) => (prev === option.value ? null : option.value))}
                  className={`rounded-full border px-2.5 py-1 text-xs transition ${
                    reason === option.value
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text)]"
                      : "border-[var(--border)] bg-[var(--surface)]/40 text-[var(--text-muted)] hover:bg-[var(--surface)]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <input
            type="text"
            maxLength={140}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Anything specific? (optional)"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--text-muted)]">
              {note.length}/140
              {note.trim().length === 0 && autoSubmitIn != null ? (
                <span className="text-amber-300"> • auto-submits in {autoSubmitIn}s</span>
              ) : (
                ""
              )}
            </p>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submitFeedback()}
              className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-60"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" />
                  Saving
                </span>
              ) : (
                "Submit"
              )}
            </button>
          </div>
          {error ? <p className="text-xs text-red-400">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
