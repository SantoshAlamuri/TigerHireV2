"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ClipboardCheck,
  FileText,
  GitBranch,
  ListChecks,
  Megaphone,
  Mic,
  Sparkles,
  Stamp,
} from "lucide-react";
import type { RequisitionWorkflowSnapshot } from "@/lib/workflows/requisition-approval-workflow";
import { isPlanDocumentUiEnabled } from "@/lib/rollouts/plan-document-ui";

type DashboardPrefix = "/recruit" | "/company";

type PlaybookOutcome = {
  headline: string;
  detail?: string;
  href?: string;
  hrefLabel?: string;
  secondaryHref?: string;
  secondaryHrefLabel?: string;
};

function formatStatus(status: string): string {
  return status.replace(/_/g, " ");
}

function formatApproverRole(role: string): string {
  return role.replace(/_/g, " ");
}

/** In-dashboard text links: visible keyboard focus (Web Interface Guidelines). */
const playbookTextLinkClass =
  "inline-flex items-center gap-1 rounded-sm text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";

const playbookPillLinkClass =
  "inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-[var(--text)] transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30";

/** Mirrors pipeline routing in RequisitionThreadBanner. */
export function playbookPipelineHref(params: {
  dashboardPrefix: DashboardPrefix;
  userRole?: string | null;
  jobId?: string | null;
}): string {
  const { dashboardPrefix, userRole, jobId } = params;
  const q = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
  if (dashboardPrefix === "/company") {
    if (userRole === "leadership") {
      return jobId ? `/recruit/pipeline${q}` : "/recruit/pipeline";
    }
    return jobId ? `/company/my-pipeline${q}` : "/company/my-pipeline";
  }
  return jobId ? `/recruit/pipeline${q}` : "/recruit/pipeline";
}

function playbookJobHref(params: {
  dashboardPrefix: DashboardPrefix;
  userRole?: string | null;
  jobId: string;
}): string {
  const { dashboardPrefix, userRole, jobId } = params;
  if (dashboardPrefix === "/company" && userRole === "hiring_manager") {
    return `/company/jobs/${jobId}/edit`;
  }
  if (dashboardPrefix === "/company") {
    return `/company/jobs/${jobId}`;
  }
  return `/recruit/jobs/${jobId}`;
}

/** JD Base / scoring wizard anchor on the job detail page. */
export function playbookScoringSetupHref(params: {
  dashboardPrefix: DashboardPrefix;
  userRole?: string | null;
  jobId: string;
}): string {
  const { dashboardPrefix, userRole, jobId } = params;
  if (isPlanDocumentUiEnabled()) {
    return `/recruit/jobs/${jobId}#ideal-profile-setup`;
  }
  if (dashboardPrefix === "/company" && userRole === "hiring_manager") {
    return `/company/jobs/${jobId}#scoring-setup`;
  }
  if (dashboardPrefix === "/company") {
    return `/company/jobs/${jobId}#scoring-setup`;
  }
  return `/recruit/jobs/${jobId}#ideal-profile-setup`;
}

function primaryOutcome(input: {
  status: string;
  jobId: string | null;
  dashboardPrefix: DashboardPrefix;
  userRole?: string | null;
  canRecruiterAct: boolean;
  approvalWorkflow?: RequisitionWorkflowSnapshot | null;
}): PlaybookOutcome {
  const { status, jobId, dashboardPrefix, userRole, canRecruiterAct, approvalWorkflow } = input;
  const st = status.toLowerCase();

  if (st === "draft") {
    return {
      headline: "Finish and submit this requisition.",
      detail: "After submit, recruiters and approvers are notified automatically.",
    };
  }

  if (st === "on_hold") {
    return {
      headline: "This requisition is on hold.",
      detail: "Review restarts on the planned date before moving candidates forward.",
    };
  }

  if (st === "rejected") {
    return {
      headline: "This requisition was rejected.",
      detail: "Clone or create a new requisition if the role still needs to be hired.",
    };
  }

  if (st === "pending" || st === "submitted" || st === "under_review") {
    const awaiting = approvalWorkflow?.awaitingRoles ?? [];
    const workflowIssue = approvalWorkflow?.issue;
    const awaitingLabel =
      awaiting.length > 0 ? `Waiting on: ${awaiting.map(formatApproverRole).join(", ")}.` : null;

    return {
      headline: canRecruiterAct
        ? "Step 1 — Approve this requisition to create the draft role."
        : "Step 1 — Awaiting recruiter or approver decision.",
      detail: [
        canRecruiterAct
          ? "Approve runs the configured workflow, then AI drafts a job description. Next you will confirm the JD template and scoring rubric on the job page."
          : "Approvers receive in-app notifications with approve/reject links.",
        awaitingLabel,
        workflowIssue,
      ]
        .filter(Boolean)
        .join(" "),
    };
  }

  if ((st === "approved" || st === "converted") && jobId) {
    const scoringHref = playbookScoringSetupHref({ dashboardPrefix, userRole, jobId });
    const jobHref = playbookJobHref({ dashboardPrefix, userRole, jobId });
    const isHm = dashboardPrefix === "/company" && userRole === "hiring_manager";
    return {
      headline: "Step 2 — Set up scoring (JD template, must-haves, rubric).",
      detail:
        "Open Scoring setup on the job: pick the India preset, confirm must-haves, then approve the rubric. Publish the role when ready so applications and FitScore can run.",
      href: scoringHref,
      hrefLabel: "Open scoring setup",
      secondaryHref: jobHref,
      secondaryHrefLabel: isHm ? "Edit job copy" : "Open job",
    };
  }

  if (st === "approved" && !jobId) {
    return {
      headline: "Draft role is being generated.",
      detail:
        "Refresh in a few seconds. If this stays empty, retry approval or contact your recruiter.",
    };
  }

  if (st === "converted" && !jobId) {
    return {
      headline: "Converted — link the generated job from your recruiter if missing.",
      detail: "assigned_job_id is not visible yet on this screen.",
    };
  }

  return {
    headline: `Status: ${formatStatus(st)}`,
    detail: "Use the milestones below so the team stays aligned.",
  };
}

export function HiringPlaybookCard({
  dashboardPrefix,
  requestStatus,
  assignedJobId,
  userRole,
  canRecruiterAct,
  approvalWorkflow,
  recruiterActions,
  actionError,
}: {
  dashboardPrefix: DashboardPrefix;
  requestStatus: string;
  assignedJobId: string | null;
  userRole?: string | null;
  canRecruiterAct: boolean;
  approvalWorkflow?: RequisitionWorkflowSnapshot | null;
  recruiterActions?: ReactNode;
  actionError?: string | null;
}) {
  const jobId = assignedJobId ?? null;
  const pipelineHref = playbookPipelineHref({ dashboardPrefix, userRole, jobId });
  const assessmentsHref =
    dashboardPrefix === "/company" ? "/company/assessments" : "/recruit/assessments";
  const interviewPrepHref =
    dashboardPrefix === "/company" ? "/company/interview-prep" : "/recruit/interview-prep";
  const offersHref =
    dashboardPrefix === "/company" ? "/company/offers/draft" : "/recruit/offers/draft";

  const outcome = primaryOutcome({
    status: requestStatus,
    jobId,
    dashboardPrefix,
    userRole,
    canRecruiterAct,
    approvalWorkflow,
  });

  const showConnectedLinks = Boolean(jobId);

  return (
    <div className="card-lifted p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="hiring-playbook-heading"
            className="heading-section text-balance text-base text-[var(--text)]"
          >
            Your hiring path
          </h2>
          <p className="mt-1 max-w-xl text-xs text-white/55">
            Requisition → scoring setup → applications → pipeline. Automated WhatsApp screening runs
            after FitScore when enabled — separate from formal assessments.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)] sm:text-xs">
          What to do now
        </p>
        <p className="mt-2 text-sm font-semibold text-[var(--text)]">{outcome.headline}</p>
        {outcome.detail ? (
          <p className="mt-2 text-xs leading-relaxed text-white/60">{outcome.detail}</p>
        ) : null}

        {approvalWorkflow?.issue && !canRecruiterAct ? (
          <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
            {approvalWorkflow.issue}
          </p>
        ) : null}

        {recruiterActions ? (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            {actionError ? <p className="mb-3 text-sm text-red-400">{actionError}</p> : null}
            {recruiterActions}
          </div>
        ) : null}

        {(outcome.href && outcome.hrefLabel) || showConnectedLinks ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {outcome.href && outcome.hrefLabel ? (
              <Link href={outcome.href} className={playbookPillLinkClass}>
                <Sparkles size={14} aria-hidden />
                {outcome.hrefLabel}
              </Link>
            ) : null}
            {outcome.secondaryHref && outcome.secondaryHrefLabel ? (
              <Link href={outcome.secondaryHref} className={playbookPillLinkClass}>
                <FileText size={14} aria-hidden />
                {outcome.secondaryHrefLabel}
              </Link>
            ) : null}
            {showConnectedLinks ? (
              <Link href={pipelineHref} className={playbookPillLinkClass}>
                <GitBranch size={14} aria-hidden />
                Pipeline
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <details className="mt-6 group">
        <summary className="cursor-pointer text-sm font-semibold text-white/70 hover:text-white/90">
          Full playbook — assessments, interviews, offers
        </summary>
        <ol className="mt-4 space-y-5" aria-labelledby="hiring-playbook-heading">
          <li className="flex gap-3">
            <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text)]">1. Requisition approval</p>
              <p className="mt-1 text-xs leading-relaxed text-white/55">
                Submitted reqs start the configured approval workflow. Recruiters use the actions in
                &ldquo;What to do now&rdquo; above; other approvers get email/in-app shortcuts.
              </p>
            </div>
          </li>

          <li className="flex gap-3">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--text)]">
                2. Scoring setup &amp; publish
              </p>
              <p className="mt-1 text-xs leading-relaxed text-white/55">
                On the job page, Scoring setup walks through the JD template (preset), must-haves,
                and rubric approval. Publish when ready so apply links and FitScore work.
              </p>
              {jobId ? (
                <div className="mt-2 flex flex-wrap gap-3">
                  <Link
                    href={playbookScoringSetupHref({ dashboardPrefix, userRole, jobId })}
                    className={playbookTextLinkClass}
                  >
                    Scoring setup
                  </Link>
                  <Link
                    href={playbookJobHref({ dashboardPrefix, userRole, jobId })}
                    className={playbookTextLinkClass}
                  >
                    Open job
                  </Link>
                </div>
              ) : (
                <p className="mt-2 text-xs italic text-white/40">Available after approval.</p>
              )}
            </div>
          </li>

          <li className="flex gap-3">
            <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--text)]">3. Pipeline &amp; FitScore</p>
              <p className="mt-1 text-xs leading-relaxed text-white/55">
                Applications enqueue FitScore. WhatsApp/voice screening may trigger after scoring
                based on org settings.
              </p>
              <Link href={pipelineHref} className={`mt-2 ${playbookTextLinkClass}`}>
                Open pipeline
              </Link>
            </div>
          </li>

          <li className="flex gap-3">
            <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--text)]">4. Assessments (tests)</p>
              <p className="mt-1 text-xs leading-relaxed text-white/55">
                Recruiters assign formal tests per candidate from the Assessments workspace.
              </p>
              <Link href={assessmentsHref} className={`mt-2 ${playbookTextLinkClass}`}>
                Open assessments
              </Link>
            </div>
          </li>

          <li className="flex gap-3">
            <Mic className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--text)]">5. Interviews</p>
              <p className="mt-1 text-xs leading-relaxed text-white/55">
                Schedule from the job pipeline; interview prep pulls context for upcoming rounds.
              </p>
              <Link href={interviewPrepHref} className={`mt-2 ${playbookTextLinkClass}`}>
                Interview prep
              </Link>
            </div>
          </li>

          <li className="flex gap-3">
            <Stamp className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--text)]">6. Offer</p>
              <p className="mt-1 text-xs leading-relaxed text-white/55">
                Start an offer draft when the hire decision is made.
              </p>
              <Link href={offersHref} className={`mt-2 ${playbookTextLinkClass}`}>
                Offer drafts
              </Link>
            </div>
          </li>

          <li className="flex gap-3 border-t border-[var(--border)] pt-4">
            <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400/90" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-200/90">
                When scoring unlocks pipeline moves
              </p>
              <p className="mt-1 text-xs leading-relaxed text-white/55">
                Assessments with auto-advance can move candidates when they pass the configured
                threshold.
              </p>
            </div>
          </li>
        </ol>
      </details>
    </div>
  );
}
