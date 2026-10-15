"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { jobPipelineHref } from "@/lib/navigation/job-workspace-paths";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { JobReadinessResponse } from "@/lib/jobs/job-readiness";
import type { ActionableTask } from "@/lib/tasks/actionable-task-types";
import type { StatusTone } from "@/lib/status-tones";

type PhaseStatus = "not_started" | "in_progress" | "blocked" | "done";

type PlanPendingResponse = { tasks: ActionableTask[] };

function toneFor(status: PhaseStatus): StatusTone {
  if (status === "done") return "success";
  if (status === "blocked") return "danger";
  if (status === "in_progress") return "info";
  return "neutral";
}

function labelFor(status: PhaseStatus): string {
  if (status === "done") return "Done";
  if (status === "blocked") return "Blocked";
  if (status === "in_progress") return "In progress";
  return "Not started";
}

function nextActorLine(tasks: ActionableTask[], phase: 1 | 2 | 3): string | null {
  const open = tasks.filter((t) => t.action_shape === "decide" && t.phase === phase);
  if (open.length === 0) return null;
  const first = open[0];
  const role = first.assignee_role?.replace(/_/g, " ") ?? "Approver";
  const extra = open.length > 1 ? ` (+${open.length - 1} more)` : "";
  return `${role} must decide: ${first.title}${extra}`;
}

export function PlanLifecycleSections({
  jobId,
  pipelineCounts,
}: {
  jobId: string;
  pipelineCounts: { total: number; byStage: { name: string; count: number }[] };
}) {
  const { data: readiness } = useApiQuery<JobReadinessResponse>(`/api/jobs/${jobId}/readiness`);
  const { data: pending } = useApiQuery<PlanPendingResponse>(`/api/jobs/${jobId}/plan/pending`);
  const { user } = useAuth();
  // Pipeline link target scoped to the role's authorized base — a hiring
  // manager must not be linked to /recruit/pipeline (server bounces it to Home).
  // Link generation only; server RBAC remains the gate (Jobs #11).
  const pipelineHref = jobPipelineHref(user?.role, jobId);

  const decideTasks = useMemo(
    () => (pending?.tasks ?? []).filter((t) => t.action_shape === "decide"),
    [pending?.tasks],
  );

  const phases = useMemo(() => {
    const req = readiness?.requisition;
    const jd = readiness?.jd;
    const jdBase = readiness?.jd_base;

    let launch: PhaseStatus = "not_started";
    let launchBlocker = "Link or approve a hiring requisition";
    let launchCta = { href: `/recruit/hiring-requests`, label: "View requisitions" };
    let launchNextActor: string | null = null;

    if (req?.hiring_request_id) {
      if (req.status === "approved" || req.status === "on_hold") {
        launch = jd?.status === "published" ? "done" : "in_progress";
        launchBlocker =
          jd?.status === "published"
            ? "Role is live — share or distribute"
            : "Publish the job description";
        launchCta = { href: `/recruit/jobs/${jobId}`, label: "Review job posting" };
      } else if (req.status === "rejected") {
        launch = "blocked";
        launchBlocker = "Requisition was rejected";
      } else {
        launch = "in_progress";
        launchBlocker = `Requisition ${req.req_code ?? ""} awaiting approval`.trim();
        launchCta = {
          href: req.hiring_request_id
            ? `/recruit/hiring-requests/${req.hiring_request_id}`
            : `/recruit/hiring-requests`,
          label: "Open requisition",
        };
        launchNextActor = nextActorLine(decideTasks, 1);
      }
    }

    const pipelineTotal = pipelineCounts.total;
    let pipeline: PhaseStatus = pipelineTotal > 0 ? "in_progress" : "not_started";
    let pipelineBlocker =
      pipelineTotal > 0
        ? `${pipelineTotal} candidate${pipelineTotal === 1 ? "" : "s"} in pipeline`
        : "Shortlist and move candidates into the pipeline";
    let pipelineNextActor = nextActorLine(decideTasks, 2);
    if (jdBase?.status === "pending_approval") {
      pipeline = "blocked";
      pipelineBlocker = "Ideal Profile pending approval — scoring may be blocked";
    }

    let hire: PhaseStatus = "not_started";
    let hireBlocker = "No active offers yet";
    const offerDecide = decideTasks.filter((t) => t.kind === "approval_offer_finance");
    const hireNextActor = nextActorLine(decideTasks, 3);
    if (offerDecide.length > 0) {
      hire = "in_progress";
      hireBlocker = `${offerDecide.length} offer decision${offerDecide.length === 1 ? "" : "s"} waiting`;
    }

    const tasksHref = `/tasks?jobId=${encodeURIComponent(jobId)}`;
    const hireCta = offerDecide.length
      ? { href: `${tasksHref}&shape=decide&category=approvals`, label: "Decide on offers" }
      : {
          href: pipelineHref,
          label: "Open pipeline for offer stage",
        };

    return [
      {
        key: "launch",
        title: "1 — Launch",
        subtitle: "Requisition → posting",
        status: launch,
        blocker: launchBlocker,
        nextActor: launchNextActor,
        cta: launchCta,
      },
      {
        key: "pipeline",
        title: "2 — Pipeline",
        subtitle: "Shortlist → screen → interview",
        status: pipeline,
        blocker: pipelineBlocker,
        nextActor: pipelineNextActor,
        cta: {
          href: pipelineHref,
          label: "Open pipeline",
        },
        stages: pipelineCounts.byStage,
      },
      {
        key: "hire",
        title: "3 — Hire",
        subtitle: "Offer → join",
        status: hire,
        blocker: hireBlocker,
        nextActor: hireNextActor,
        cta: hireCta,
      },
    ] as const;
  }, [readiness, pipelineCounts, jobId, decideTasks, pipelineHref]);

  const decideCount = decideTasks.length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="heading-section text-lg font-semibold text-[var(--text)]">
          Hiring progress
        </h2>
        {decideCount > 0 ? (
          <Link
            href={`/tasks?jobId=${encodeURIComponent(jobId)}&shape=decide`}
            className="text-xs font-medium text-[var(--accent)] hover:underline"
          >
            {decideCount} decision{decideCount === 1 ? "" : "s"} waiting in Tasks →
          </Link>
        ) : null}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {phases.map((phase) => (
          <div key={phase.key} className="card-lifted flex flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-[var(--text)]">{phase.title}</p>
                <p className="text-xs text-white/50">{phase.subtitle}</p>
              </div>
              <StatusBadge tone={toneFor(phase.status)} size="sm">
                {labelFor(phase.status)}
              </StatusBadge>
            </div>
            <p className="mt-3 text-sm text-white/60">{phase.blocker}</p>
            {phase.nextActor ? (
              <p className="mt-1 text-xs font-medium text-amber-400/90">{phase.nextActor}</p>
            ) : null}
            {"stages" in phase && phase.stages && phase.stages.length > 0 ? (
              <ul className="mt-2 space-y-0.5 text-xs text-white/45">
                {phase.stages.slice(0, 4).map((s) => (
                  <li key={s.name}>
                    {s.name}: {s.count}
                  </li>
                ))}
              </ul>
            ) : null}
            <Link
              href={phase.cta.href}
              className="mt-auto pt-3 text-xs font-medium text-[var(--accent)] hover:underline"
            >
              {phase.cta.label} →
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
