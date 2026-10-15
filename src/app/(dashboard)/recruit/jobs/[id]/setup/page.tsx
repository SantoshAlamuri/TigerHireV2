"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useIdealProfileGate } from "@/app/(dashboard)/recruit/jobs/[id]/hooks/useIdealProfileGate";
import {
  buildSetupSequence,
  hiringRequestRef,
  stageHasInterviewer,
  type SetupStep,
} from "@/lib/v2/setup-sequence";
import { jobPublicationState } from "@/lib/jobs/publication-state";
import { isJdPublished } from "@/lib/jobs/job-readiness";
import { SetupStageWorkspace } from "./SetupStageWorkspace";
import { SeatGate } from "../../../v2/SeatGate";

/**
 * Job Setup — five required steps in hiring language, then optional operations.
 */
function RecruitJobSetupPageBody() {
  const { id } = useParams<{ id: string }>();
  const gate = useIdealProfileGate(id);

  const {
    data: jobData,
    loading: jobLoading,
    error: jobError,
  } = useApiQuery<{
    job: {
      title?: string;
      description?: string;
      jd_sections?: unknown;
      status?: string;
      is_active?: boolean;
      list_on_public_job_board?: boolean;
      hiring_request_id?: string | null;
      hiring_requests?:
        | { id?: string; status?: string }
        | Array<{ id?: string; status?: string }>
        | null;
    };
    orgSlug?: string;
  }>(id ? `/api/jobs/${id}` : null);
  const { data: apps } = useApiQuery<{ pagination?: { total?: number } }>(
    id ? "/api/applications" : null,
    id ? { jobId: id, limit: 1 } : undefined,
  );
  const { data: stages } = useApiQuery<{
    stages: {
      id: string;
      interviewer_user_id?: string | null;
      interviewer_email?: string | null;
      interviewer_name?: string | null;
      interviewer?: { id?: string } | null;
    }[];
  }>(id ? `/api/jobs/${id}/pipeline-stages` : null);
  const { data: templates } = useApiQuery<{ templates: { id: string }[] }>(
    id ? `/api/jobs/${id}/feedback-templates` : null,
  );
  const { data: screening } = useApiQuery<{
    applyQuestions?: { id: string }[];
    postShortlistQuestions?: { id: string }[];
  }>(id ? `/api/jobs/${id}/whatsapp-screening` : null);
  const { data: assessments } = useApiQuery<{ assessments?: { id: string }[] }>(
    id ? "/api/assessments" : null,
    id ? { jobId: id, limit: 1 } : undefined,
  );

  if (!id) return null;

  const stageRows = stages?.stages ?? [];
  const applyCount = screening?.applyQuestions?.length ?? 0;
  const postShortlistCount = screening?.postShortlistQuestions?.length ?? 0;
  const publication = jobPublicationState(jobData?.job);
  const channelsLive = publication.publicApplications && jobData?.orgSlug ? 1 : 0;
  const requisition = hiringRequestRef(jobData?.job ?? {});

  const seq = buildSetupSequence(
    {
      jdPublished: isJdPublished(jobData?.job?.description, jobData?.job?.jd_sections).published,
      rubricApproved: gate.approved,
      rubricNotRequired: gate.hybridDisabled,
      screeningQuestionCount: applyCount,
      postShortlistQuestionCount: postShortlistCount,
      interviewStageCount: stageRows.length,
      stagesWithInterviewer: stageRows.filter(stageHasInterviewer).length,
      scorecardAttached: (templates?.templates?.length ?? 0) > 0,
      assessmentAttached: (assessments?.assessments?.length ?? 0) > 0,
      channelsLive,
      applicants: apps?.pagination?.total ?? 0,
      hiringRequestId: requisition.id,
      hiringRequestStatus: requisition.status,
      mustHaveCount: gate.mustHaveCount,
      roleOpen: jobData?.job?.status === "open",
    },
    id,
  );
  const requiredSteps = seq.steps.filter((step) => !step.optional);
  const optionalSteps = seq.steps.filter((step) => step.optional);
  if (jobLoading || gate.loading)
    return (
      <p role="status" className="text-sm text-[var(--text-muted)]">
        Loading setup…
      </p>
    );
  if (jobError || !jobData?.job)
    return (
      <p role="alert" className="text-sm text-[var(--status-danger-fg)]">
        Could not load job setup. Reload to try again.
      </p>
    );

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-[var(--text)]">Job setup</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {jobData?.job?.title ?? ""} · {publication.label}
          </p>
        </div>
        <Link
          href={`/recruit/jobs/${id}`}
          className="text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          ← Job
        </Link>
      </div>

      <p className="mb-4 text-sm text-[var(--text-muted)]">{publication.detail}</p>

      <SetupStageWorkspace
        jobId={id}
        steps={requiredSteps}
        description={jobData.job.description ?? ""}
        scoringEnabled={!gate.hybridDisabled}
      />
      <details className="mt-4 rounded-xl border border-[var(--border)] p-4">
        <summary className="cursor-pointer text-sm font-medium">Optional hiring setup</summary>
        <ul className="mt-3 space-y-2">
          {optionalSteps.map((step) => (
            <li key={step.key}>
              <Link href={step.href} className="text-sm text-[var(--text-muted)]">
                {step.title}
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
export default function RecruitJobSetupPage() {
  return (
    <SeatGate need="editJobSetup" what="Job setup">
      <RecruitJobSetupPageBody />
    </SeatGate>
  );
}
