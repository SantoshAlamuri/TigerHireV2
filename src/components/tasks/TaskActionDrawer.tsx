"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { playbookScoringSetupHref } from "@/components/dashboard/HiringPlaybookCard";
import type { ActionableTask } from "@/lib/tasks/actionable-task-types";
import { externalHrefForActionableTask } from "@/lib/tasks/actionable-task-external-href";
import { actTaskButtonLabel, actTaskGuidance } from "@/lib/tasks/actionable-act-guidance";
import { TASK_ACTION_SHAPE_LABEL } from "@/lib/tasks/task-display";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";

type Props = {
  task: ActionableTask | null;
  onClose: () => void;
  onCompleted: () => void;
};

export function TaskActionDrawer({ task, onClose, onCompleted }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setNotes("");
    setError(null);
  }, [task?.id]);

  const handleDecision = useCallback(
    async (decision: "approved" | "rejected") => {
      if (!task) return;
      const comment = notes.trim();
      if (decision === "rejected" && !comment) {
        setError("Add a reason before rejecting — it is required for the audit trail.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const body: Record<string, unknown> = { decision, comment: comment || null };
        if (task.kind === "approval_shortlist") {
          body.jobId = task.job_id;
          body.candidateId = task.candidate_id;
          if (!body.jobId || !body.candidateId) {
            setError("Missing job or candidate context");
            return;
          }
        } else if (task.kind === "approval_requisition") {
          body.requestId = task.request_id;
          if (!body.requestId) {
            setError("Missing requisition context");
            return;
          }
        } else if (task.kind === "approval_offer_finance") {
          body.offerId = task.offer_id;
          if (!body.offerId) {
            setError("Missing offer context");
            return;
          }
        } else {
          setError("Use Open to complete this task.");
          return;
        }

        const res = await fetch(`/api/approvals/tasks/${task.id}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as {
          error?: string;
          generatedJob?: { id: string; title?: string };
          request?: { status?: string; assigned_job_id?: string | null };
          pendingApproverRoles?: string[];
        };
        if (!res.ok) {
          setError(
            json.error ?? (res.status === 422 ? "Rejection requires a comment." : "Action failed"),
          );
          return;
        }
        setNotes("");
        onCompleted();
        onClose();

        if (task.kind === "approval_requisition" && decision === "approved") {
          const inlineJobId =
            json.generatedJob?.id ?? (json.request?.assigned_job_id as string | undefined);
          const fullyApproved =
            json.request?.status === "approved" || json.request?.status === "converted";

          // Multi-stage chains advance a stage without flipping the requisition.
          // Without this line the first Approve looks like a no-op — the single
          // most-reported "broken button" in the product.
          if (!fullyApproved) {
            const waitingOn = (json.pendingApproverRoles ?? [])
              .map((r) => r.replace(/_/g, " "))
              .join(", ");
            toast({
              tone: "success",
              title: "Approval recorded",
              description: waitingOn
                ? `Now waiting on ${waitingOn} to approve.`
                : "Waiting on the next approval stage.",
            });
          } else {
            toast({
              tone: "success",
              title: "Requisition fully approved",
              description: "Approval saved. You can leave while the draft is prepared.",
            });
          }
          if (fullyApproved && task.request_id) {
            // Navigate immediately; the request page tracks background drafting.
            const jobId = inlineJobId;
            if (jobId) {
              const dashboardPrefix =
                task.assignee_role === "hiring_manager" ? "/company" : "/recruit";
              router.push(
                playbookScoringSetupHref({
                  dashboardPrefix,
                  userRole: task.assignee_role,
                  jobId,
                }),
              );
            } else {
              router.push(`/recruit/hiring-requests/${task.request_id}`);
            }
          }
        }
      } catch {
        setError("Request failed");
      } finally {
        setLoading(false);
      }
    },
    [task, notes, onClose, onCompleted, router],
  );

  if (!task) return null;

  const canDecideInline = task.action_shape === "decide" && task.kind.startsWith("approval_");
  const externalHref = externalHrefForActionableTask(task);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Complete task"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--text)]">Complete task</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {task.type_label ? (
              <StatusBadge tone="neutral" size="sm">
                {task.type_label}
              </StatusBadge>
            ) : null}
            {task.action_shape ? (
              <StatusBadge tone={task.action_shape === "decide" ? "info" : "neutral"} size="sm">
                {TASK_ACTION_SHAPE_LABEL[task.action_shape]}
              </StatusBadge>
            ) : null}
          </div>

          <p className="text-base font-medium text-[var(--text)]">
            {task.subject_label ?? task.title}
          </p>

          <dl className="mt-4 space-y-2 text-sm">
            {task.context_label ? (
              <div>
                <dt className="text-xs text-white/45">In</dt>
                <dd className="text-white/75">{task.context_label}</dd>
              </div>
            ) : null}
            {task.requested_by_name ? (
              <div>
                <dt className="text-xs text-white/45">Requested by</dt>
                <dd className="text-white/75">{task.requested_by_name}</dd>
              </div>
            ) : null}
            {task.comment_preview ? (
              <div>
                <dt className="text-xs text-white/45">Note</dt>
                <dd className="text-white/60">{task.comment_preview}</dd>
              </div>
            ) : null}
          </dl>

          {task.kind === "approval_requisition" && task.request_id ? (
            <Link
              href={
                task.assignee_role === "hiring_manager" || task.assignee_role === "leadership"
                  ? `/company/hiring-requests/${task.request_id}`
                  : `/recruit/hiring-requests/${task.request_id}`
              }
              className="mt-4 inline-flex text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
            >
              View requisition
            </Link>
          ) : null}

          {canDecideInline ? (
            <div className="mt-6 space-y-3">
              <p className="text-xs text-white/50">
                Your decision is recorded in the audit trail and appears in Plan activity for this
                role.
              </p>
              <label className="block text-xs text-white/50">
                Comment{" "}
                {task.kind === "approval_requisition" ? "(required to reject)" : "(optional)"}
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white/[0.03] px-3 py-2 text-sm text-[var(--text)]"
                  placeholder={
                    task.kind === "approval_requisition"
                      ? "Required if you reject…"
                      : "Optional context for approvers…"
                  }
                />
              </label>
              {error ? <p className="text-sm text-red-400">{error}</p> : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleDecision("approved")}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Approve
                </button>
                <button
                  type="button"
                  disabled={loading || (task.kind === "approval_requisition" && !notes.trim())}
                  onClick={() => void handleDecision("rejected")}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              <p className="text-sm text-white/55">{actTaskGuidance(task)}</p>
              <Link
                href={externalHref}
                className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black"
              >
                {task.action_label ?? actTaskButtonLabel(task.kind)}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
