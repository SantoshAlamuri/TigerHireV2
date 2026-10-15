"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  FileText,
  Inbox,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ExternalLink,
  Sparkles,
  PauseCircle,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { HiringRequestOnHoldModal } from "@/components/dashboard/HiringRequestOnHoldModal";
import { HiringRequestRejectModal } from "@/components/dashboard/HiringRequestRejectModal";
import { playbookScoringSetupHref } from "@/components/dashboard/HiringPlaybookCard";
import { isPlanDocumentUiEnabled } from "@/lib/rollouts/plan-document-ui";
import { TASKS_APPROVALS_HREF } from "@/lib/tasks/tasks-approvals-href";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useApiQuery } from "@/lib/hooks/use-api";
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

type TabFilter = "all" | "pending" | "approved" | "converted";

export default function RecruiterHiringRequestsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabFilter>("pending");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const planTasksEnabled = isPlanDocumentUiEnabled();
  const [optimisticStatusById, setOptimisticStatusById] = useState<Record<string, string>>({});
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [onHoldTargetId, setOnHoldTargetId] = useState<string | null>(null);
  const [holdReason, setHoldReason] = useState("");
  const [holdResumeAt, setHoldResumeAt] = useState("");

  const statusParam = tab === "all" ? undefined : tab;
  const { data, loading, error, refetch } = useApiQuery<{
    requests: Record<string, unknown>[];
  }>("/api/hiring-requests", statusParam ? { status: statusParam } : undefined);

  const requests = (data?.requests ?? []).map((req) =>
    optimisticStatusById[String(req.id)]
      ? { ...req, status: optimisticStatusById[String(req.id)] }
      : req,
  );
  const canCreateRequisition =
    user?.role === "hiring_manager" ||
    user?.role === "recruiter" ||
    user?.role === "leadership" ||
    user?.role === "super_admin";

  const handleApprove = useCallback(
    async (id: string) => {
      setActionLoading(id);
      try {
        const res = await fetch(`/api/approvals/tasks/requisition:${id}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "approved", requestId: id }),
          credentials: "include",
        });
        const json = await res.json();
        if (res.ok) {
          const inlineJobId = json.generatedJob?.id as string | undefined;
          const reqStatus = json.request?.status as string | undefined;
          const fullyApproved = reqStatus === "approved" || reqStatus === "converted";
          if (fullyApproved) {
            // Approval succeeds independently of background drafting.
            toast({
              title: "Request approved",
              description: "Approval saved. The draft job will appear here when ready.",
              tone: "success",
            });
            const jobId = inlineJobId ?? null;
            if (jobId) {
              toast({
                title: "Draft JD ready",
                description: "Opening scoring setup.",
                tone: "success",
              });
              router.push(
                playbookScoringSetupHref({
                  dashboardPrefix: "/recruit",
                  userRole: user?.role,
                  jobId,
                }),
              );
            } else {
              router.push(`/recruit/hiring-requests/${id}`);
            }
          } else {
            toast({
              title: "Approval recorded",
              description: "Waiting on the next approver in the workflow.",
              tone: "info",
            });
          }
          setOptimisticStatusById((prev) => {
            const { [id]: _, ...rest } = prev;
            return rest;
          });
          await refetch();
        } else {
          setOptimisticStatusById((prev) => {
            const { [id]: _, ...rest } = prev;
            return rest;
          });
          toast({
            title: "Couldn't approve request",
            description: json.error ?? "Failed to approve",
            tone: "error",
          });
        }
      } catch {
        setOptimisticStatusById((prev) => {
          const { [id]: _, ...rest } = prev;
          return rest;
        });
        toast({
          title: "Couldn't approve request",
          description: "Please try again.",
          tone: "error",
        });
      }
      setActionLoading(null);
    },
    [refetch, router, toast, user],
  );

  const confirmReject = useCallback(async () => {
    if (!rejectTargetId || !rejectReason.trim()) return;
    const id = rejectTargetId;
    setActionLoading(id);
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
      if (res.ok) {
        toast({ title: "Request rejected", tone: "success" });
        setRejectTargetId(null);
        setRejectReason("");
        await refetch();
      } else {
        toast({
          title: "Couldn't reject request",
          description: json.error ?? "Rejection failed",
          tone: "error",
        });
      }
    } catch {
      toast({
        title: "Couldn't reject request",
        description: "Please try again.",
        tone: "error",
      });
    }
    setActionLoading(null);
  }, [rejectReason, rejectTargetId, refetch, toast]);

  const handleConfirmOnHold = useCallback(async () => {
    if (!onHoldTargetId || !holdReason.trim() || !holdResumeAt.trim()) return;
    setActionLoading(onHoldTargetId);
    setOptimisticStatusById((prev) => ({ ...prev, [onHoldTargetId]: "on_hold" }));
    try {
      const res = await fetch(`/api/hiring-requests/${onHoldTargetId}`, {
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
      if (res.ok) {
        setOnHoldTargetId(null);
        setHoldReason("");
        setHoldResumeAt("");
        setOptimisticStatusById((prev) => {
          const { [onHoldTargetId]: _, ...rest } = prev;
          return rest;
        });
        toast({
          title: "Request placed on hold",
          tone: "success",
        });
        await refetch();
      } else {
        setOptimisticStatusById((prev) => {
          const { [onHoldTargetId]: _, ...rest } = prev;
          return rest;
        });
        toast({
          title: "Couldn't place on hold",
          description: json.error ?? "Failed to place on hold",
          tone: "error",
        });
      }
    } catch {
      setOptimisticStatusById((prev) => {
        const { [onHoldTargetId]: _, ...rest } = prev;
        return rest;
      });
      toast({
        title: "Couldn't place on hold",
        description: "Please try again.",
        tone: "error",
      });
    }
    setActionLoading(null);
  }, [onHoldTargetId, holdReason, holdResumeAt, refetch, toast]);

  const tabs: { key: TabFilter; label: string }[] = [
    { key: "pending", label: "Pending" },
    { key: "converted", label: "Converted to JD" },
    { key: "all", label: "All" },
  ];

  const listSkeleton = (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card-lifted p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3 max-w-md" />
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-3 w-full max-w-lg" />
            </div>
            <Skeleton className="h-6 w-28 shrink-0 rounded-full" />
          </div>
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="h-8 w-16 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Hiring Requests"
        subtitle="Approve requests — JDs are auto-generated by AI"
      />
      <HiringRequestRejectModal
        open={rejectTargetId !== null}
        reason={rejectReason}
        onReasonChange={setRejectReason}
        onCancel={() => {
          setRejectTargetId(null);
          setRejectReason("");
        }}
        onSubmit={() => void confirmReject()}
        submitting={rejectTargetId !== null && actionLoading === rejectTargetId}
      />
      <HiringRequestOnHoldModal
        open={onHoldTargetId !== null}
        holdReason={holdReason}
        holdResumeAt={holdResumeAt}
        onReasonChange={setHoldReason}
        onResumeChange={setHoldResumeAt}
        onCancel={() => {
          setOnHoldTargetId(null);
          setHoldReason("");
          setHoldResumeAt("");
        }}
        onSubmit={() => void handleConfirmOnHold()}
        submitting={onHoldTargetId !== null && actionLoading === onHoldTargetId}
      />
      <div className="mb-6 flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              tab === t.key
                ? "bg-white/[0.05] border border-white/10 font-semibold text-white"
                : "bg-transparent border border-white/10 font-medium text-white/55 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        listSkeleton
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 py-12">
          <p className="px-4 text-center text-sm text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-md border border-white/10 px-4 py-2 text-sm text-white/65 transition hover:bg-white/[0.04] hover:text-white"
          >
            Retry
          </button>
        </div>
      ) : requests.length === 0 ? (
        <div className="mx-auto max-w-md card-lifted px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-500/10 text-white/45">
            <Inbox className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-[var(--text)]">
            {tab === "pending" ? "Nothing in this queue" : "No requisitions match this filter"}
          </h2>
          <p className="text-body mt-2 text-sm text-white/65">
            When a hiring manager submits a requisition, you&apos;ll see it here to review, place on
            hold, or convert into a job — with an AI draft JD when you approve.
          </p>
          <div className="mt-6 flex flex-col items-stretch gap-2 sm:items-center">
            {canCreateRequisition ? (
              <Link
                href="/company/hiring-requests/new"
                className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
              >
                Create a requisition
              </Link>
            ) : null}
            <div className="flex flex-col gap-1 text-sm sm:flex-row sm:gap-3">
              <Link
                href="/recruit/jobs"
                className="font-medium text-white/75 transition hover:text-white hover:underline"
              >
                Go to job descriptions
              </Link>
              {tab === "all" && (
                <button
                  type="button"
                  onClick={() => setTab("pending")}
                  className="text-white/65 transition hover:text-white"
                >
                  Show pending first
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const status = STATUS_META[(req.status as string) ?? ""] ?? STATUS_META.submitted;
            const st = String(req.status ?? "");
            const needsReview = st === "pending" || st === "submitted" || st === "under_review";
            const isConverted = req.status === "converted";
            const isLoading = actionLoading === (req.id as string);
            const assignedJobId = req.assigned_job_id as string | null;
            const urgency = String(req.urgency ?? "normal");
            const urgencyTone = getJobPriorityTone(
              urgency as "low" | "normal" | "high" | "urgent" | "critical",
            );
            const urgencyLabel = urgency.charAt(0).toUpperCase() + urgency.slice(1);

            return (
              <div key={req.id as string} className="card-lifted p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="heading-card text-base text-[var(--text)]">
                      {req.title as string}
                    </h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-white/45">
                      {Boolean(req.req_code) && (
                        <span className="font-mono text-white/65">{String(req.req_code)}</span>
                      )}
                      {Boolean(req.department) && <span>{String(req.department)}</span>}
                      <span>Headcount: {Number(req.headcount)}</span>
                      <StatusBadge tone={urgencyTone} size="sm">
                        {urgencyLabel}
                      </StatusBadge>
                      {Boolean(req.created_by_name) && (
                        <span>By: {String(req.created_by_name)}</span>
                      )}
                    </div>
                    {Boolean(req.description) && (
                      <p className="mt-2 line-clamp-3 text-sm text-white/65">
                        {String(req.description)}
                      </p>
                    )}
                    {Boolean(req.notes) && (
                      <p className="mt-1 text-xs italic text-white/45">
                        Notes: {String(req.notes)}
                      </p>
                    )}
                  </div>
                  <StatusBadge
                    tone={getApprovalStatusTone(String(req.status ?? ""))}
                    icon={status.icon}
                  >
                    {status.label}
                  </StatusBadge>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/recruit/hiring-requests/${req.id as string}`}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 px-3 py-1 text-xs font-medium text-white/65 transition hover:bg-white/[0.04] hover:text-white"
                  >
                    View details
                  </Link>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={async () => {
                      setActionLoading(req.id as string);
                      try {
                        const res = await fetch(`/api/hiring-requests/${req.id as string}/clone`, {
                          method: "POST",
                          credentials: "include",
                        });
                        const payload = await res.json();
                        if (!res.ok) {
                          toast({
                            title: "Couldn't clone request",
                            description: payload.error ?? "Failed to clone requisition",
                            tone: "error",
                          });
                        } else {
                          toast({
                            title: "Requisition cloned",
                            description: "New draft created.",
                            tone: "success",
                          });
                          await refetch();
                        }
                      } catch {
                        toast({
                          title: "Couldn't clone request",
                          description: "Please try again.",
                          tone: "error",
                        });
                      } finally {
                        setActionLoading(null);
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 px-3 py-1 text-xs font-medium text-white/65 transition hover:bg-white/[0.04] hover:text-white disabled:opacity-60"
                  >
                    Clone
                  </button>
                </div>

                {/* Action buttons for requests awaiting recruiter action */}
                {needsReview && planTasksEnabled ? (
                  <div className="mt-4 border-t border-white/10 pt-4">
                    <Link
                      href={TASKS_APPROVALS_HREF}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)]/15 px-4 py-1.5 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)]/25"
                    >
                      <Sparkles size={12} /> Decide in Tasks
                    </Link>
                  </div>
                ) : null}
                {needsReview && !planTasksEnabled ? (
                  <div className="mt-4 border-t border-white/10 pt-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => handleApprove(req.id as string)}
                        className="flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-4 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />
                            Approving & generating JD...
                          </>
                        ) : (
                          <>
                            <Sparkles size={12} />
                            Approve & Auto-Generate JD
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => {
                          setRejectTargetId(req.id as string);
                          setRejectReason("");
                        }}
                        className="flex items-center gap-1.5 rounded-md bg-rose-500/15 px-4 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <XCircle size={12} /> Reject
                      </button>
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => {
                          setOnHoldTargetId(req.id as string);
                          setHoldReason("");
                          setHoldResumeAt("");
                        }}
                        className="flex items-center gap-1.5 rounded-md bg-white/[0.04] px-4 py-1.5 text-xs font-semibold text-white/65 ring-1 ring-inset ring-white/[0.06] transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <PauseCircle size={12} /> On hold
                      </button>
                    </div>
                    {isLoading && (
                      <p className="mt-2 text-xs text-white/45">
                        AI is reading the request and generating a complete structured JD with all
                        sections. This takes a few seconds...
                      </p>
                    )}
                  </div>
                ) : null}

                {/* Link to review draft JD for converted requests */}
                {isConverted && assignedJobId && (
                  <div className="mt-4 border-t border-white/10 pt-4">
                    <button
                      type="button"
                      onClick={() => router.push(`/recruit/jobs/${assignedJobId}`)}
                      className="flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-4 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
                    >
                      <ExternalLink size={12} /> Review Draft JD
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
