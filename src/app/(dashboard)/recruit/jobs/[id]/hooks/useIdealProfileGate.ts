"use client";

import { useApiQuery } from "@/lib/hooks/use-api";

type JdBaseResponse = {
  jdBase?: {
    approvedBy?: string | null;
    idealCandidateProfile?: { must_haves?: string[] | null } | null;
  };
};

/**
 * Mirrors JdBaseSetupStep scoring gate: hybrid disabled → allow score;
 * otherwise require approved ideal profile.
 */
export function useIdealProfileGate(jobId: string | undefined) {
  const { data, loading, error } = useApiQuery<JdBaseResponse>(
    jobId ? `/api/fitscore/jd-base` : null,
    jobId ? { jobId } : undefined,
  );

  const err = error ?? undefined;
  const hybridDisabled =
    typeof err === "string" && (err.includes("not enabled") || err.includes("Hybrid FitScore"));

  const approved = Boolean(data?.jdBase?.approvedBy);
  const canScore = hybridDisabled || approved;
  const mustHaveCount = (data?.jdBase?.idealCandidateProfile?.must_haves ?? []).filter(
    (item) => typeof item === "string" && item.trim().length > 0,
  ).length;

  const message = hybridDisabled
    ? undefined
    : loading
      ? "Checking Ideal Profile setup..."
      : err && !hybridDisabled
        ? "Ideal Profile setup is currently unavailable."
        : !approved
          ? "Set up Ideal Profile to enable scoring for this job."
          : undefined;

  return { canScore, approved, hybridDisabled, loading, message, mustHaveCount };
}
