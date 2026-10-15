"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { isPlanDocumentUiEnabled } from "@/lib/rollouts/plan-document-ui";
import JobMatchesPage from "../matches/page";

/**
 * Plan-first candidates view: uses global pipeline filtered to this job.
 * Full plan-stage kanban columns ship in Phase C/D.
 */
export default function JobCandidatesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const planFirst = isPlanDocumentUiEnabled();

  useEffect(() => {
    if (planFirst && id) {
      router.replace(`/recruit/pipeline?jobId=${encodeURIComponent(id)}`);
    }
  }, [planFirst, id, router]);

  if (planFirst) {
    return <p className="text-sm text-white/60">Opening pipeline for this job…</p>;
  }

  return <JobMatchesPage />;
}
