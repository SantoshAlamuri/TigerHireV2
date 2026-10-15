"use client";

import { Fragment, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Loader2,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Copy,
  Sparkles,
  PauseCircle,
  ExternalLink,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { HiringRequestOnHoldModal } from "@/components/dashboard/HiringRequestOnHoldModal";
import { HiringRequestRejectModal } from "@/components/dashboard/HiringRequestRejectModal";
import { playbookScoringSetupHref } from "@/components/dashboard/HiringPlaybookCard";
import { isPlanDocumentUiEnabled } from "@/lib/rollouts/plan-document-ui";
import { TASKS_APPROVALS_HREF } from "@/lib/tasks/tasks-approvals-href";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getApprovalStatusTone, getJobPriorityTone } from "@/lib/status-tones";

const STATUS_META: Record<string, { label: string; icon: React.ReactNode }> = {
  draft: {
    label: "Draft",
    icon: <FileText size={14} />,
  },
  submitted: {
    label: "Submitted",
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
    label: "Pending",
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

type TabFilter = "all" | "pending" | "approved" | "converted" | "rejected";

export default function HiringRequestsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const isHM = user?.role === "hiring_manager";
  const canRunRecruiterActions =
    user?.role === "leadership" || user?.role === "recruiter" || user?.role === "super_admin";
  const canCreateRequest =
    user?.role === "hiring_manager" ||
    user?.role === "recruiter" ||
    user?.role === "leadership" ||
    user?.role === "super_admin";
  const planTasksEnabled = isPlanDocumentUiEnabled();
  const [tab, setTab] = useState<TabFilter>(canRunRecruiterActions ? "pending" : "all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);
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
                  dashboardPrefix: user?.role === "hiring_manager" ? "/company" : "/recruit",
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
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "converted", label: "Converted to JD" },
  ];

  return (
    <>
      <PageHeader
        title="Hiring Requests"
        subtitle={isHM ? "Your hiring requests" : "Review hiring requests from managers"}
        actions={
          canCreateRequest ? (
            <Link
              href="/company/hiring-requests/new"
              className="flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
            >
              <Plus size={16} /> New Request
            </Link>
          ) : undefined
        }
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
      <div className="card-lifted flex flex-wrap gap-2 p-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === t.key
                ? "bg-[var(--accent)] text-black"
                : "border border-[var(--border)] text-white/60 hover:bg-white/[0.04]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="card-lifted p-4">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-3 h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm text-red-400">
          {error}
        </div>
      ) : requests.length === 0 ? (
        <div className="card-lifted flex flex-col items-center justify-center py-16">
          <FileText size={40} className="text-white/60" />
          <p className="text-body mt-4 text-white/60">
            {isHM ? "No hiring requests yet" : "No hiring requests to review"}
          </p>
          {canCreateRequest && (
            <Link
              href="/company/hiring-requests/new"
              className="mt-4 flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
            >
              <Plus size={16} /> Create Request
            </Link>
          )}
        </div>
      ) : (
        <div className="card-lifted overflow-x-auto p-0">
          <table className="min-w-full text-left">
            <thead className="border-b border-[var(--border)] bg-[var(--bg-elevated)]/60">
              <tr className="text-xs uppercase tracking-wider text-white/60">
                <th className="px-4 py-3 font-semibold">Req Code</th>
                <th className="px-4 py-3 font-semibold">Title</th>
                <th className="px-4 py-3 font-semibold">Department</th>
                <th className="px-4 py-3 font-semibold">Headcount</th>
                <th className="px-4 py-3 font-semibold">Urgency</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                {!isHM && <th className="px-4 py-3 font-semibold">Created By</th>}
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => {
                const status = STATUS_META[(req.status as string) ?? ""] ?? STATUS_META.submitted;
                const statusTone = getApprovalStatusTone(req.status as string);
                const urgencyTone = getJobPriorityTone(
                  ((req.urgency as string | undefined) ?? "normal") as
                    | "low"
                    | "normal"
                    | "high"
                    | "urgent"
                    | "critical",
                );
                const st = String(req.status ?? "");
                const needsReview = st === "pending" || st === "submitted" || st === "under_review";
                const isConverted = req.status === "converted";
                const assignedJobId = req.assigned_job_id as string | null;
                const isLoading = actionLoading === (req.id as string);
                const colSpan = isHM ? 7 : 8;

                return (
                  <Fragment key={req.id as string}>
                    <tr className="border-b border-[var(--border)]/60 text-sm text-white/60 last:border-b-0">
                      <td className="px-4 py-3 font-mono text-xs text-white/60">
                        {String(req.req_code ?? "—")}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/company/hiring-requests/${req.id as string}`}
                          className="font-medium text-[var(--text)] hover:text-[var(--accent)]"
                        >
                          {String(req.title ?? "Untitled request")}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{String(req.department ?? "—")}</td>
                      <td className="px-4 py-3">{Number(req.headcount ?? 0)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={urgencyTone} size="sm">
                          {((req.urgency as string) ?? "normal").charAt(0).toUpperCase() +
                            ((req.urgency as string) ?? "normal").slice(1)}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={statusTone} icon={status.icon} size="sm">
                          {status.label}
                        </StatusBadge>
                      </td>
                      {!isHM && <td className="px-4 py-3">{String(req.created_by_name ?? "—")}</td>}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                          <button
                            type="button"
                            disabled={cloningId === (req.id as string)}
                            onClick={async () => {
                              setCloningId(req.id as string);
                              try {
                                const res = await fetch(
                                  `/api/hiring-requests/${req.id as string}/clone`,
                                  {
                                    method: "POST",
                                    credentials: "include",
                                  },
                                );
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
                                setCloningId(null);
                              }
                            }}
                            className="inline-flex items-center justify-center gap-1 rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium text-white/60 transition hover:bg-white/[0.04] hover:text-[var(--text)] disabled:opacity-60"
                          >
                            {cloningId === (req.id as string) ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Copy size={12} />
                            )}
                            Clone
                          </button>
                          {canRunRecruiterActions && needsReview && planTasksEnabled ? (
                            <Link
                              href={TASKS_APPROVALS_HREF}
                              className="inline-flex items-center justify-center gap-1 rounded-full bg-[var(--accent)]/15 px-3 py-1 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)]/25"
                            >
                              <Sparkles size={12} /> Decide in Tasks
                            </Link>
                          ) : null}
                          {canRunRecruiterActions && needsReview && !planTasksEnabled ? (
                            <>
                              <button
                                type="button"
                                disabled={isLoading}
                                onClick={() => void handleApprove(req.id as string)}
                                className="inline-flex items-center justify-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-50"
                              >
                                {isLoading ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <Sparkles size={12} />
                                )}
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={isLoading}
                                onClick={() => {
                                  setRejectTargetId(req.id as string);
                                  setRejectReason("");
                                }}
                                className="inline-flex items-center justify-center gap-1 rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/25 disabled:opacity-50"
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
                                className="inline-flex items-center justify-center gap-1 rounded-full bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/65 ring-1 ring-inset ring-white/[0.06] transition hover:bg-white/[0.06] disabled:opacity-50"
                              >
                                <PauseCircle size={12} /> Hold
                              </button>
                            </>
                          ) : null}
                          {canRunRecruiterActions && isConverted && assignedJobId && (
                            <button
                              type="button"
                              onClick={() => router.push(`/recruit/jobs/${assignedJobId}`)}
                              className="inline-flex items-center justify-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
                            >
                              <ExternalLink size={12} /> Draft JD
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {canRunRecruiterActions && needsReview && isLoading && (
                      <tr className="border-b border-[var(--border)]/40">
                        <td colSpan={colSpan} className="px-4 pb-3 text-xs text-white/45">
                          AI is generating the structured JD — this can take a few seconds…
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
