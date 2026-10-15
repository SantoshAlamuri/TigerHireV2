"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

interface FitScoreAlternativeProps {
  jobId: string;
  candidateId: string;
  primaryScore: number;
  shadowScore: number;
  recruiterSelected?: "primary" | "shadow";
  onRefetch?: () => void | Promise<unknown>;
  /** Called with the new selection and displayed score so parent can update the main badge immediately. */
  onSelectionSaved?: (selection: "primary" | "shadow", displayedScore: number) => void;
}

export default function FitScoreAlternative({
  jobId,
  candidateId,
  primaryScore,
  shadowScore,
  recruiterSelected,
  onRefetch,
  onSelectionSaved,
}: FitScoreAlternativeProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimisticSelection, setOptimisticSelection] = useState<"primary" | "shadow" | null>(null);

  useEffect(() => {
    if (optimisticSelection != null && recruiterSelected === optimisticSelection) {
      setOptimisticSelection(null);
    }
  }, [optimisticSelection, recruiterSelected]);

  const displaySelection = optimisticSelection ?? recruiterSelected;
  const usingShadow = displaySelection === "shadow";
  const otherScore = usingShadow ? primaryScore : shadowScore;
  const displayedScore = usingShadow ? shadowScore : primaryScore;

  async function handleSelect(selection: "primary" | "shadow") {
    setOptimisticSelection(selection);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fitscore/select-blend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: candidateId, job_id: jobId, selection }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message = typeof body?.error === "string" ? body.error : "Failed to save selection";
        setError(message);
        setOptimisticSelection(null);
        throw new Error(message);
      }
      const data = (await res.json()) as { displayed_score?: number };
      const newScore =
        typeof data?.displayed_score === "number" ? data.displayed_score : displayedScore;
      onSelectionSaved?.(selection, newScore);
      await onRefetch?.();
    } catch {
      // Error already handled above
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1 text-xs">
      <span className="text-[var(--text-muted)]">
        Alternative: <strong className="text-[var(--text)]">{otherScore}</strong>
      </span>
      {error && (
        <span className="text-red-500" role="alert">
          {error}
        </span>
      )}
      {loading ? (
        <Loader2 size={12} className="animate-spin text-[var(--text-muted)]" />
      ) : usingShadow ? (
        <button
          type="button"
          onClick={() => handleSelect("primary")}
          className="rounded border border-[var(--border)] px-2 py-0.5 text-[var(--text-muted)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]"
        >
          Use original
        </button>
      ) : (
        <button
          type="button"
          onClick={() => handleSelect("shadow")}
          className="rounded border border-[var(--border)] px-2 py-0.5 text-[var(--text-muted)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--accent)]"
        >
          Use this score
        </button>
      )}
    </div>
  );
}
