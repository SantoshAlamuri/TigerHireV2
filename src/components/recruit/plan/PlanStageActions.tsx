"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Calendar, CheckSquare, FileText, Users } from "lucide-react";
import { buildJobAssessmentsHref } from "@/lib/assessments/job-assessments-href";
import { isAssessmentStageReadyForAutoSend } from "@/lib/assessments/plan-assessment-ready";
import type { PlanStageRow } from "@/lib/recruitment-plan/types";

export function PlanStageActions({
  jobId,
  stage,
  candidateCount,
  sampleCandidateId,
  sampleApplicationId,
}: {
  jobId: string;
  stage: PlanStageRow;
  candidateCount: number;
  /** First candidate in this stage — pipeline / profile links. */
  sampleCandidateId?: string | null;
  /** Application for that candidate on this job — offer draft workspace. */
  sampleApplicationId?: string | null;
}) {
  const pipelineHref = `/recruit/pipeline?jobId=${encodeURIComponent(jobId)}`;
  const btnClass =
    "inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-white/85 hover:bg-white/[0.06]";
  const primaryClass =
    "inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 py-1.5 text-xs font-semibold text-black hover:bg-[var(--accent-hover)]";

  if (stage.stage_type === "interview") {
    return (
      <Row className="mt-3 flex flex-wrap gap-2">
        <Link href={`/recruit/jobs/${jobId}/interviews`} className={primaryClass}>
          <Calendar className="h-3.5 w-3.5" aria-hidden />
          Open interviews
        </Link>
        <Link href={pipelineHref} className={btnClass}>
          <Users className="h-3.5 w-3.5" aria-hidden />
          {candidateCount > 0 ? `${candidateCount} in pipeline` : "View pipeline"}
        </Link>
        {!stage.primary_interviewer_id ? (
          <p className="w-full text-xs text-amber-400/90">
            Assign a primary interviewer in stage settings so slot picker can run on move.
          </p>
        ) : null}
      </Row>
    );
  }

  if (stage.stage_type === "assessment") {
    const assessmentsHref = buildJobAssessmentsHref(jobId, {
      applicationId: sampleApplicationId,
      stageId: stage.pipeline_stage_id,
    });
    return (
      <Row className="mt-3 flex flex-wrap gap-2">
        <Link href={assessmentsHref} className={primaryClass}>
          <CheckSquare className="h-3.5 w-3.5" aria-hidden />
          Open assessments
        </Link>
        <Link href={pipelineHref} className={btnClass}>
          <Users className="h-3.5 w-3.5" aria-hidden />
          {candidateCount > 0 ? `${candidateCount} in pipeline` : "View pipeline"}
        </Link>
        {!stage.scorecard_template_id ? (
          <p className="w-full text-xs text-amber-400/90">
            Link a scorecard template in stage settings so reviewers know how to grade submissions.
          </p>
        ) : null}
        <p className="w-full text-xs text-white/50">
          {isAssessmentStageReadyForAutoSend(stage)
            ? "When plan auto-execute is on, moving a candidate here creates and shares the assessment automatically."
            : sampleApplicationId
              ? "Create or review assessments for a candidate in this stage."
              : "Move a candidate into this stage in pipeline, then send assessments from here."}
        </p>
      </Row>
    );
  }

  if (stage.stage_type === "offer") {
    const offerHref = sampleApplicationId
      ? `/recruit/offers/draft?applicationId=${encodeURIComponent(sampleApplicationId)}`
      : pipelineHref;
    const canDraftOffer = Boolean(sampleApplicationId);
    return (
      <Row className="mt-3 flex flex-wrap gap-2">
        <Link href={offerHref} className={primaryClass}>
          <FileText className="h-3.5 w-3.5" aria-hidden />
          {canDraftOffer ? "Draft offer" : "Open pipeline"}
        </Link>
        {sampleCandidateId ? (
          <Link href={pipelineHref} className={btnClass}>
            <Users className="h-3.5 w-3.5" aria-hidden />
            All candidates
          </Link>
        ) : null}
        <Link
          href={`/tasks?jobId=${encodeURIComponent(jobId)}&shape=decide&category=approvals`}
          className={btnClass}
        >
          Offer approvals in Tasks
        </Link>
        <p className="w-full text-xs text-white/50">
          {canDraftOffer
            ? "Draft the offer here; finance and HM approve in Tasks before send — never auto-sent."
            : "Move a candidate into the offer stage in pipeline, then draft from here."}
        </p>
      </Row>
    );
  }

  if (stage.stage_type === "application_review") {
    return (
      <Row className="mt-3 flex flex-wrap gap-2">
        <Link href={pipelineHref} className={primaryClass}>
          <Users className="h-3.5 w-3.5" aria-hidden />
          {candidateCount > 0 ? `Review ${candidateCount} candidates` : "View pipeline"}
        </Link>
      </Row>
    );
  }

  if (candidateCount > 0) {
    return (
      <Row className="mt-3">
        <Link href={pipelineHref} className={btnClass}>
          <Users className="h-3.5 w-3.5" aria-hidden />
          {candidateCount} in pipeline
        </Link>
      </Row>
    );
  }

  return null;
}

function Row({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={className}>{children}</div>;
}
