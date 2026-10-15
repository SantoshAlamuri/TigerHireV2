"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Loader2,
  ArrowLeft,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Sparkles,
  PauseCircle,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { RequisitionThreadBanner } from "@/components/dashboard/RequisitionThreadBanner";
import {
  HiringPlaybookCard,
  playbookScoringSetupHref,
} from "@/components/dashboard/HiringPlaybookCard";
import type { RequisitionWorkflowSnapshot } from "@/lib/workflows/requisition-approval-workflow";
import { HiringOfferAuditTimeline } from "@/components/dashboard/HiringOfferAuditTimeline";
import { HiringRequestOnHoldModal } from "@/components/dashboard/HiringRequestOnHoldModal";
import { HiringRequestRejectModal } from "@/components/dashboard/HiringRequestRejectModal";
import { tasksApprovalDeepLink } from "@/lib/tasks/tasks-approvals-href";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { isPlanDocumentUiEnabled } from "@/lib/rollouts/plan-document-ui";
import { getApprovalStatusTone, getJobPriorityTone } from "@/lib/status-tones";

const STATUS_META: Record<string, { label: string; icon: React.ReactNode }> = {
  draft: {
    label: "Draft",
    icon: <FileText size={14} />,
  },
  submitted: {
    label: "Awaiting review",
    icon: <Clock size={14} />,
  },
  under_review: {
    label: "Under review",
    icon: <Clock size={14} />,
  },
  on_hold: {
    label: "On hold",
    icon: <Clock size={14} />,
  },
  pending: {
    label: "Pending Review",
    icon: <Clock size={14} />,
  },
  approved: {
    label: "Approved",
    icon: <CheckCircle2 size={14} />,
  },
  converted: {
    label: "Converted to JD",
    icon: <ArrowRight size={14} />,
  },
  rejected: {
    label: "Rejected",
    icon: <XCircle size={14} />,
  },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HiringRequestDetailPage() {
  const { toast } = useToast();
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { user } = useAuth();
  const requestsListHref = useMemo(
    () =>
      user?.role === "hiring_manager" ? "/company/hiring-requests" : "/recruit/hiring-requests",
    [user?.role],
  );
  const [actionBusy, setActionBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [onHoldOpen, setOnHoldOpen] = useState(false);
  const [holdReason, setHoldReason] = useState("");
  const [holdResumeAt, setHoldResumeAt] = useState("");
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const { data, loading, error, refetch } = useApiQuery<{
    approvalWorkflow?: RequisitionWorkflowSnapshot | null;
    request: {
      id: string;
      title: string;
      created_by?: string;
      organisation_id?: string;
      department?: string | null;
      headcount?: number;
      urgency?: string;
      description?: string | null;
      notes?: string | null;
      status?: string;
      req_code?: string | null;
      role_level?: string | null;
      cost_center?: string | null;
      employment_type?: string | null;
      location_type?: string | null;
      location_city?: string | null;
      headcount_type?: string | null;
      business_justification?: string | null;
      target_joining_date?: string | null;
      budget_ctc_min?: number | null;
      budget_ctc_max?: number | null;
      on_hold_reason?: string | null;
      on_hold_resume_at?: string | null;
      assigned_job_id?: string | null;
      created_by_name?: string;
      created_at?: string;
      updated_at?: string;
    };
  }>(id ? `/api/hiring-requests/${id}` : null);

  const request = data?.request;
  const awaitingDraft = request?.status === "approved" && !request.assigned_job_id;
  useEffect(() => {
    if (!awaitingDraft) return;
    let cancelled = false;
    let checks = 0;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      await refetch({ silent: true });
      if (!cancelled && ++checks < 12) timer = setTimeout(check, 5000);
    };
    timer = setTimeout(check, 5000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [awaitingDraft, refetch]);

  const confirmOnHold = useCallback(async () => {
    if (!id || !holdReason.trim() || !holdResumeAt.trim()) return;
    setActionBusy(true);
    setActionErr(null);
    try {
      const res = await fetch(`/api/hiring-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "on_hold",
          holdReason: holdReason.trim(),
          holdResumeAt: holdResumeAt.trim(),
        }),
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        setActionErr(json.error ?? "Failed to place on hold");
        return;
      }
      setOnHoldOpen(false);
      setHoldReason("");
      setHoldResumeAt("");
      await refetch();
    } catch {
      setActionErr("Failed to place on hold. Please try again.");
    } finally {
      setActionBusy(false);
    }
  }, [id, holdReason, holdResumeAt, refetch]);

  if (loading && !request) {
    return (
      <>
        <PageHeader title="Hiring Request" subtitle="Loading..." />
        <div className="space-y-4 py-4">
          <div className="card-lifted p-6">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="mt-3 h-4 w-1/2" />
            <Skeleton className="mt-6 h-20 w-full" />
          </div>
          <div className="card-lifted p-6">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-3 h-20 w-full" />
          </div>
        </div>
      </>
    );
  }

  if (error || !request) {
    return (
      <>
        <PageHeader title="Hiring Request" subtitle="Not found" />
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="card-lifted p-12 text-center">
            <p className="heading-card text-lg text-[var(--text)]">Hiring request not found</p>
            <p className="text-body mt-2 text-sm text-white/65">No request exists with this ID.</p>
            <Link
              href={requestsListHref}
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--accent)] hover:underline"
            >
              <ArrowLeft size={16} />
              Back to Hiring Requests
            </Link>
          </div>
        </div>
      </>
    );
  }

  const displayedStatus = optimisticStatus ?? request.status ?? "";
  const status = STATUS_META[displayedStatus] ?? STATUS_META.submitted;
  const statusTone = getApprovalStatusTone(displayedStatus);
  const urgencyTone = getJobPriorityTone(
    (request.urgency as "low" | "normal" | "high" | "urgent" | "critical" | null) ?? "normal",
  );
  const isConverted = displayedStatus === "converted";
  const assignedJobId = request.assigned_job_id;
  const reqRef = request.req_code ? `${request.req_code} · ` : "";
  const st = String(displayedStatus);
  const needsReview = st === "pending" || st === "submitted" || st === "under_review";
  // An active workflow whose current stage isn't this actor's to decide.
  // pendingTaskId is set by the snapshot only when the actor may act (or is
  // super_admin), so a null pendingTaskId on an active workflow means it's
  // awaiting someone else (e.g. Finance) — don't offer this actor an approve
  // action that would 403 and falsely flip the status (Hiring Request).
  const awaitingApproverRoles = data?.approvalWorkflow?.awaitingRoles ?? [];
  const awaitingOtherApprover =
    data?.approvalWorkflow?.instanceStatus === "active" &&
    !data?.approvalWorkflow?.pendingTaskId &&
    awaitingApproverRoles.length > 0;
  const awaitingApprovalLabel = (() => {
    const labels: Record<string, string> = {
      finance: "Finance",
      leadership: "Admin",
      recruiter: "Recruiter",
      hiring_manager: "Hiring Manager",
    };
    const mapped = awaitingApproverRoles.map((r) => labels[r] ?? r);
    if (mapped.length <= 1) return mapped[0] ?? "";
    return `${mapped.slice(0, -1).join(", ")} & ${mapped[mapped.length - 1]}`;
  })();
  const canRecruiterAct =
    Boolean(user) &&
    ["recruiter", "leadership", "super_admin"].includes(user!.role) &&
    needsReview &&
    !awaitingOtherApprover;
  const canCloneRequest =
    Boolean(user) &&
    ["hiring_manager", "recruiter", "leadership", "super_admin"].includes(user?.role ?? "");
  const planTasksEnabled = isPlanDocumentUiEnabled();
  const requisitionTaskId = data?.approvalWorkflow?.pendingTaskId ?? null;
  const tasksDecideHref = requisitionTaskId
    ? tasksApprovalDeepLink(requisitionTaskId)
    : "/tasks?shape=decide&category=approvals";

  const handleApprove = async () => {
    const previousStatus = optimisticStatus ?? request.status ?? null;
    setActionBusy(true);
    setActionErr(null);
    try {
      const res = await fetch(`/api/approvals/tasks/requisition:${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approved", requestId: id }),
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        setOptimisticStatus(previousStatus);
        setActionErr(json.error ?? "Failed to approve");
        toast({
          title: "Approval failed",
          description: json.error ?? "Could not approve requisition.",
          tone: "error",
        });
        return;
      }
      await refetch();
      setOptimisticStatus(null);
      const inlineJobId =
        (json.generatedJob?.id as string | undefined) ??
        (json.request?.assigned_job_id as string | undefined);
      const fullyApproved =
        json.request?.status === "approved" || json.request?.status === "converted";

      toast({
        title: fullyApproved ? "Requisition approved" : "Approval recorded",
        description: fullyApproved
          ? "Approval saved. The draft job will appear here when ready."
          : "Another approver may still need to sign off before the draft role is created.",
        tone: "success",
      });
      if (fullyApproved) {
        // Do not hold a successful approval behind background generation.
        const generatedJobId = inlineJobId ?? null;
        if (generatedJobId) {
          toast({
            title: "Draft JD ready",
            description: "Opening scoring setup.",
            tone: "success",
          });
          const dashboardPrefix = user?.role === "hiring_manager" ? "/company" : "/recruit";
          router.push(
            playbookScoringSetupHref({
              dashboardPrefix,
              userRole: user?.role,
              jobId: generatedJobId,
            }),
          );
        }
      }
    } catch {
      setOptimisticStatus(previousStatus);
      setActionErr("Failed to approve. Please try again.");
      toast({
        title: "Approval failed",
        description: "Please retry approval.",
        tone: "error",
      });
    } finally {
      setActionBusy(false);
    }
  };

  const confirmReject = async () => {
    if (!rejectReason.trim()) return;
    const previousStatus = optimisticStatus ?? request.status ?? null;
    setActionBusy(true);
    setActionErr(null);
    try {
      const res = await fetch(`/api/approvals/tasks/requisition:${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "rejected",
          requestId: id,
          comment: rejectReason.trim(),
        }),
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        setActionErr(json.error ?? "Failed to reject");
        toast({
          title: "Rejection failed",
          description: json.error ?? "Could not reject requisition.",
          tone: "error",
        });
        return;
      }
      setRejectOpen(false);
      setRejectReason("");
      await refetch();
      setOptimisticStatus(null);
      toast({
        title: "Requisition rejected",
        description: "Decision has been recorded.",
        tone: "success",
      });
    } catch {
      setOptimisticStatus(previousStatus);
      setActionErr("Failed to reject. Please try again.");
      toast({
        title: "Rejection failed",
        description: "Please retry rejection.",
        tone: "error",
      });
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={request.title}
        subtitle={`${reqRef}${request.department ?? "—"} · Headcount: ${request.headcount ?? 0}`}
      />
      <HiringRequestRejectModal
        open={rejectOpen}
        reason={rejectReason}
        onReasonChange={setRejectReason}
        onCancel={() => {
          setRejectOpen(false);
          setRejectReason("");
        }}
        onSubmit={() => void confirmReject()}
        submitting={actionBusy && rejectOpen}
      />
      <HiringRequestOnHoldModal
        open={onHoldOpen}
        holdReason={holdReason}
        holdResumeAt={holdResumeAt}
        onReasonChange={setHoldReason}
        onResumeChange={setHoldResumeAt}
        onCancel={() => {
          setOnHoldOpen(false);
          setHoldReason("");
          setHoldResumeAt("");
        }}
        onSubmit={() => void confirmOnHold()}
        submitting={actionBusy && onHoldOpen}
      />
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Back button */}
        <Link
          href={requestsListHref}
          className="inline-flex items-center gap-2 text-sm font-medium text-white/65 transition hover:text-white"
        >
          <ArrowLeft size={16} />
          Back to Hiring Requests
        </Link>

        <RequisitionThreadBanner
          dashboardPrefix={user?.role === "hiring_manager" ? "/company" : "/recruit"}
          activeStep={isConverted || assignedJobId ? "role" : "requisition"}
          hiringRequest={{
            id: request.id,
            req_code: request.req_code as string | null | undefined,
            title: request.title,
          }}
          jobId={assignedJobId}
        />

        {awaitingDraft && (
          <div
            role="status"
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
          >
            <p className="text-sm font-semibold text-[var(--text)]">
              Approval saved — draft job not ready yet
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              You can leave and return to this request.
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={loading}
              className="mt-2 text-sm font-semibold text-[var(--accent)]"
            >
              {loading ? "Checking…" : "Check again"}
            </button>
          </div>
        )}

        {(isConverted || displayedStatus === "approved") && assignedJobId ? (
          <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-4">
            <p className="text-sm font-semibold text-[var(--text)]">
              Request approved — review the draft role
            </p>
            <p className="mt-1 text-xs text-white/60">
              The draft role is created. Open scoring setup on the job page to review the ICP,
              must-haves, and rubric before FitScore runs.
            </p>
            <Link
              href={playbookScoringSetupHref({
                dashboardPrefix: user?.role === "hiring_manager" ? "/company" : "/recruit",
                userRole: user?.role,
                jobId: assignedJobId,
              })}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
            >
              <Sparkles size={14} />
              Review requirements &amp; evaluation
            </Link>
          </div>
        ) : null}

        {request.status === "draft" &&
          request.created_by === user?.id &&
          request.organisation_id === user?.organisationId && (
            <Link
              href={`/recruit/hiring-requests/${id}/edit`}
              className="inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black"
            >
              Resume draft request
            </Link>
          )}
        {/* Title card */}
        <div className="card-lifted p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <h1 className="heading-card text-xl text-[var(--text)]">{request.title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={statusTone} icon={status.icon} size="sm">
                {status.label}
              </StatusBadge>
              <StatusBadge tone={urgencyTone} size="sm">
                {(request.urgency ?? "normal").charAt(0).toUpperCase() +
                  (request.urgency ?? "normal").slice(1)}
              </StatusBadge>
              {awaitingOtherApprover ? (
                <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-200">
                  Awaiting {awaitingApprovalLabel} approval
                </span>
              ) : null}
              {canCloneRequest ? (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={async () => {
                    setActionBusy(true);
                    setActionErr(null);
                    try {
                      const response = await fetch(`/api/hiring-requests/${id}/clone`, {
                        method: "POST",
                        credentials: "include",
                      });
                      const payload = await response.json();
                      if (!response.ok) {
                        setActionErr(payload.error ?? "Failed to clone requisition");
                        return;
                      }
                      const clonedId = payload?.request?.id as string | undefined;
                      if (clonedId)
                        router.push(
                          user?.role === "hiring_manager"
                            ? `/company/hiring-requests/${clonedId}`
                            : `/recruit/hiring-requests/${clonedId}`,
                        );
                    } catch {
                      setActionErr("Failed to clone requisition. Please try again.");
                    } finally {
                      setActionBusy(false);
                    }
                  }}
                  className="rounded-md border border-[var(--border)] px-3 py-1 text-xs font-semibold text-white/65 transition hover:bg-white/[0.04] disabled:opacity-60"
                >
                  Clone
                </button>
              ) : null}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/65">
            {Boolean(request.req_code) && (
              <span className="font-mono">Ref: {request.req_code}</span>
            )}
            {Boolean(request.department) && <span>Department: {request.department}</span>}
            <span>Headcount: {request.headcount ?? 0}</span>
            {Boolean(request.role_level) && <span>Level: {request.role_level}</span>}
            {Boolean(request.employment_type) && (
              <span>Employment: {String(request.employment_type).replace(/_/g, " ")}</span>
            )}
            {Boolean(request.location_type) && (
              <span>
                Location: {String(request.location_type).replace(/_/g, " ")}
                {request.location_city ? ` (${request.location_city})` : ""}
              </span>
            )}
            {Boolean(request.cost_center) && <span>Cost center: {request.cost_center}</span>}
            {Boolean(request.headcount_type) && (
              <span>Headcount type: {String(request.headcount_type).replace(/_/g, " ")}</span>
            )}
            {(request.budget_ctc_min != null || request.budget_ctc_max != null) && (
              <span>
                Budget CTC:{" "}
                {[request.budget_ctc_min, request.budget_ctc_max]
                  .filter((n) => n != null)
                  .join(" – ")}
              </span>
            )}
            {Boolean(request.target_joining_date) && (
              <span>Target join: {request.target_joining_date}</span>
            )}
            {Boolean(request.created_by_name) && <span>Created by: {request.created_by_name}</span>}
            {Boolean(request.created_at) && <span>Created: {formatDate(request.created_at!)}</span>}
            {Boolean(request.updated_at) && <span>Updated: {formatDate(request.updated_at!)}</span>}
          </div>
        </div>

        <HiringPlaybookCard
          dashboardPrefix={user?.role === "hiring_manager" ? "/company" : "/recruit"}
          requestStatus={displayedStatus}
          assignedJobId={assignedJobId ?? null}
          userRole={user?.role}
          canRecruiterAct={canRecruiterAct}
          approvalWorkflow={data?.approvalWorkflow ?? null}
          actionError={actionErr}
          recruiterActions={
            canRecruiterAct ? (
              <>
                {data?.approvalWorkflow?.issue ? (
                  <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
                    {data.approvalWorkflow.issue}
                  </p>
                ) : null}
                {planTasksEnabled && requisitionTaskId ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={tasksDecideHref}
                        className="flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/25"
                      >
                        <Sparkles size={14} />
                        Decide in Tasks
                      </Link>
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => {
                          setOnHoldOpen(true);
                          setHoldReason("");
                          setHoldResumeAt("");
                          setActionErr(null);
                        }}
                        className="flex items-center gap-1.5 rounded-md bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-400 transition hover:bg-amber-500/25 disabled:opacity-50"
                      >
                        <PauseCircle size={14} /> On hold
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-white/45">
                      Requisition approvals are completed in Tasks — approve or reject there so the
                      inbox stays the single source of truth.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => void handleApprove()}
                        className="flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/25 disabled:opacity-50"
                      >
                        {actionBusy ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Sparkles size={14} />
                        )}
                        Approve &amp; auto-generate JD
                      </button>
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => {
                          setRejectReason("");
                          setRejectOpen(true);
                        }}
                        className="flex items-center gap-1.5 rounded-md bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/25 disabled:opacity-50"
                      >
                        <XCircle size={14} /> Reject
                      </button>
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => {
                          setOnHoldOpen(true);
                          setHoldReason("");
                          setHoldResumeAt("");
                          setActionErr(null);
                        }}
                        className="flex items-center gap-1.5 rounded-md bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-400 transition hover:bg-amber-500/25 disabled:opacity-50"
                      >
                        <PauseCircle size={14} /> On hold
                      </button>
                    </div>
                    {actionBusy ? (
                      <p className="mt-2 text-xs text-white/45">
                        If approving, AI may take a few seconds to generate the draft JD.
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-white/45">
                        After final approval you will land on Scoring setup to confirm the JD
                        template and rubric.
                      </p>
                    )}
                  </>
                )}
              </>
            ) : undefined
          }
        />

        {request.status === "on_hold" &&
          (Boolean(request.on_hold_reason) || Boolean(request.on_hold_resume_at)) && (
            <div className="card-lifted border-amber-500/25 bg-amber-500/10 p-6">
              <h2 className="heading-section mb-2 text-base text-amber-200">On hold</h2>
              {Boolean(request.on_hold_reason) && (
                <p className="text-sm text-white/65 whitespace-pre-wrap">
                  {request.on_hold_reason}
                </p>
              )}
              {Boolean(request.on_hold_resume_at) && (
                <p className="mt-2 text-xs text-white/45">
                  Review restarts on:{" "}
                  <span className="font-medium text-[var(--text)]">
                    {request.on_hold_resume_at}
                  </span>
                </p>
              )}
            </div>
          )}

        {Boolean(request.business_justification) && (
          <div className="card-lifted p-6">
            <h2 className="heading-section mb-3 text-base text-[var(--text)]">
              Business justification
            </h2>
            <p className="text-body whitespace-pre-line text-sm leading-relaxed text-white/65">
              {request.business_justification}
            </p>
          </div>
        )}

        {/* Description section */}
        {Boolean(request.description) && (
          <div className="card-lifted p-6">
            <h2 className="heading-section mb-3 flex items-center gap-2 text-base text-[var(--text)]">
              <FileText size={18} className="text-[var(--accent)]" />
              Description
            </h2>
            <p className="text-body whitespace-pre-line text-sm leading-relaxed text-white/65">
              {request.description}
            </p>
          </div>
        )}

        {/* Notes section */}
        {Boolean(request.notes) && (
          <div className="card-lifted p-6">
            <h2 className="heading-section mb-3 text-base text-[var(--text)]">Notes</h2>
            <p className="text-body whitespace-pre-line text-sm leading-relaxed text-white/65">
              {request.notes}
            </p>
          </div>
        )}

        <HiringOfferAuditTimeline entityType="hiring_request" entityId={request.id} />
      </div>
    </>
  );
}
