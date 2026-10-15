"use client";

import { useParams } from "next/navigation";
import { useState, useEffect, useRef, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useApiQuery, useOptimisticMutation } from "@/lib/hooks/use-api";
import { mapDbFitScoreToView } from "@/lib/mappers";
import { JobMatchesSection } from "../components/JobMatchesSection";
import { useIdealProfileGate } from "../hooks/useIdealProfileGate";
import { Skeleton } from "@/components/ui/Skeleton";

type ScoreSortKey = "fit" | "icp" | "market";

export default function JobMatchesPage() {
  const { id } = useParams<{ id: string }>();
  const [recomputeSuccess, setRecomputeSuccess] = useState(false);
  const [sortKey, setSortKey] = useState<ScoreSortKey>("fit");

  const { data: jobData, loading: jobLoading } = useApiQuery<{
    job: Record<string, unknown>;
  }>(id ? `/api/jobs/${id}` : null);

  const {
    canScore: gateCanScore,
    loading: gateLoading,
    message: gateMessage,
  } = useIdealProfileGate(id);

  const canScoreCandidates = gateLoading ? false : gateCanScore;
  const scoreGateMessage = gateLoading ? "Checking Ideal Profile setup..." : gateMessage;

  const { data: scoresData, refetch: refetchScores } = useApiQuery<{
    scores: Record<string, unknown>[];
  }>(id ? "/api/fit-score" : null, id ? { jobId: id } : undefined);

  const lastScoresRefetchAt = useRef<number>(0);
  const VISIBILITY_REFETCH_THROTTLE_MS = 15_000;
  useEffect(() => {
    if (!id) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastScoresRefetchAt.current < VISIBILITY_REFETCH_THROTTLE_MS) return;
      lastScoresRefetchAt.current = now;
      refetchScores();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [id, refetchScores]);

  const fitScores = useMemo(() => {
    const rows = scoresData?.scores?.map(mapDbFitScoreToView) ?? [];
    const cmp = (
      a: ReturnType<typeof mapDbFitScoreToView>,
      b: ReturnType<typeof mapDbFitScoreToView>,
    ) => {
      if (sortKey === "icp") {
        return (b.idealMatchPct ?? -1) - (a.idealMatchPct ?? -1);
      }
      if (sortKey === "market") {
        return (b.marketPercentile ?? -1) - (a.marketPercentile ?? -1);
      }
      return b.overallScore - a.overallScore;
    };
    return rows.toSorted(cmp);
  }, [scoresData, sortKey]);

  const {
    mutate: recomputeFitScores,
    loading: recomputing,
    error: recomputeError,
  } = useOptimisticMutation<{ results?: unknown[] }, { jobId: string; candidateIds: string[] }>(
    "/api/fitscore/batch",
    { method: "POST" },
  );

  const jobRaw = jobData?.job;

  if (jobLoading) {
    return (
      <div className="space-y-6">
        <div className="card-lifted p-6">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-3 h-4 w-64" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="card-lifted space-y-3 p-5">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!jobRaw || !id) {
    return null;
  }

  const overviewHref = `/recruit/jobs/${id}#ideal-profile-setup`;

  return (
    <JobMatchesSection
      jobId={id}
      fitScores={fitScores}
      sortKey={sortKey}
      onSortKeyChange={setSortKey}
      canScoreCandidates={canScoreCandidates}
      scoreGateMessage={scoreGateMessage}
      overviewHref={overviewHref}
      refetchScores={refetchScores}
      recomputeFitScores={recomputeFitScores}
      recomputing={recomputing}
      recomputeError={recomputeError}
      recomputeSuccess={recomputeSuccess}
      setRecomputeSuccess={setRecomputeSuccess}
    />
  );
}
