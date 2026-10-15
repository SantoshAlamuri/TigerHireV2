"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useApiQuery } from "@/lib/hooks/use-api";
import { Skeleton } from "@/components/ui/Skeleton";
import { resolveStageView, stageQuery } from "@/lib/v2/stage-views";
import { StageTable, type StageRow } from "./StageTable";
import { indexScoresByCandidate, type ScoreRow } from "@/lib/v2/score-index";
import { SeatGate } from "../../../../SeatGate";

/**
 * The list behind a pipeline tile. Clicking "Applied 5" lands here and finds
 * exactly those five — same definition drives the count and the list.
 */
interface Row extends StageRow {
  created_at?: string | null;
}

function RecruitV2StagePageBody() {
  const { id, stage } = useParams<{ id: string; stage: string }>();
  const view = resolveStageView(stage ?? "");
  const query = id && stage ? stageQuery(stage, id) : null;

  const { data, loading } = useApiQuery<{ applications: Row[] }>(
    query ? "/api/applications" : null,
    query ?? undefined,
  );

  // The knockout rule lives on the job's questions; without them an answer is
  // just a boolean with no meaning attached.
  const { data: questionData } = useApiQuery<{
    questions: { id: string; fail_on_yes?: boolean | null; is_active?: boolean | null }[];
  }>(id ? `/api/jobs/${id}/screening-questions` : null);

  // applications.fit_score_id is null on every row, so the embedded join is
  // empty. One request per job beats one per candidate.
  const { data: scoreData } = useApiQuery<{ scores: ScoreRow[] }>(
    id ? "/api/fit-score" : null,
    id ? { jobId: id } : undefined,
  );

  if (!id) return null;
  if (!view) notFound();

  const scores = indexScoresByCandidate(scoreData?.scores ?? []);
  const visible = view.requiresScreeningAnswers
    ? (data?.applications ?? []).filter((a) => (a.application_screening_answers ?? []).length > 0)
    : (data?.applications ?? []);
  const rows = [...visible].sort(
    (a, b) =>
      Number(scores.get(b.candidate_id)?.overall_score ?? 0) -
      Number(scores.get(a.candidate_id)?.overall_score ?? 0),
  );
  const questions = (questionData?.questions ?? []).map((q) => ({
    id: q.id,
    failOnYes: q.fail_on_yes ?? false,
    active: q.is_active ?? true,
  }));

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-[var(--text)]">{view.title}</h1>
          <p className="text-sm text-white/55">
            {loading ? "Loading…" : `${rows.length} candidate${rows.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {view.slug === "review" && rows.length > 0 ? (
          <Link
            href={`/recruit/v2/jobs/${id}/review`}
            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black"
          >
            Review queue →
          </Link>
        ) : null}
        <Link
          href={`/recruit/jobs/${id}`}
          className="text-sm font-semibold text-white/60 hover:text-[var(--text)]"
        >
          ← Job
        </Link>
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 text-sm text-white/60">
          {view.emptyLine}
        </p>
      ) : (
        <StageTable
          rows={rows}
          stage={view.slug}
          jobId={id}
          questions={questions}
          scores={scores}
        />
      )}
    </section>
  );
}

export default function RecruitV2StagePage() {
  return (
    <SeatGate need="reviewApplications" what="The pipeline stage lists">
      <RecruitV2StagePageBody />
    </SeatGate>
  );
}
