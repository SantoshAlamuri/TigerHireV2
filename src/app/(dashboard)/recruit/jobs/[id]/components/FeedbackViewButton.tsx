"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { Skeleton } from "@/components/ui/Skeleton";

export function FeedbackViewButton({
  jobId,
  pipelineCandidateId,
}: {
  jobId: string;
  pipelineCandidateId: string;
}) {
  const [open, setOpen] = useState(false);
  const { data, loading } = useApiQuery<{
    responses: unknown[];
    aggregate: {
      count: number;
      avgRating: number | null;
      recommendations: Record<string, number>;
    };
  }>(open ? `/api/jobs/${jobId}/feedback` : null, {
    pipeline_candidate_id: pipelineCandidateId,
  });
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded px-2 py-1 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/15"
      >
        View feedback
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="heading-card text-sm text-[var(--text)]">Feedback</h4>
            {loading ? (
              <div className="mt-3 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : (
              <div className="mt-2 space-y-2 text-sm">
                {data?.aggregate && (
                  <p className="text-white/60">
                    Count: {data.aggregate.count} · Avg rating: {data.aggregate.avgRating ?? "—"}
                  </p>
                )}
                {(data?.responses ?? []).map((item, i) => {
                  const r = item as Record<string, unknown>;
                  return (
                    <div
                      key={i}
                      className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] p-2"
                    >
                      <p>
                        Rating: {(r as { overall_rating?: number }).overall_rating ?? "—"} ·
                        Recommendation: {(r as { recommendation?: string }).recommendation ?? "—"}
                      </p>
                      {typeof r.notes === "string" && r.notes && (
                        <p className="mt-1 text-white/60">{r.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-3 rounded border border-[var(--border)] px-3 py-1.5 text-xs"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
