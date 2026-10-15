"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle2, XCircle, User, Briefcase, MapPin, AlertCircle } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { useApiQuery } from "@/lib/hooks/use-api";
import type { ApprovalTaskItem, PendingShortlistApproval } from "@/lib/approvals/task-types";
import { getApprovalSourceTone, type ApprovalSource, type StatusTone } from "@/lib/status-tones";

type ApprovalFilter = "all" | "hiring_request" | "offer_finance" | "candidate_shortlist";

function parseApprovalFilterParam(raw: string | null): ApprovalFilter {
  if (
    raw === "all" ||
    raw === "hiring_request" ||
    raw === "offer_finance" ||
    raw === "candidate_shortlist"
  ) {
    return raw;
  }
  return "all";
}

const FILTER_SOURCE: Record<Exclude<ApprovalFilter, "all">, ApprovalSource> = {
  hiring_request: "hiring_request",
  offer_finance: "offer_finance",
  candidate_shortlist: "candidate_shortlist",
};

const FILTER_ACTIVE_STYLES: Record<StatusTone, string> = {
  success:
    "border-[color:var(--status-success-border)] bg-[color:var(--status-success-bg)] text-[color:var(--status-success-fg)]",
  info: "border-[color:var(--status-info-border)] bg-[color:var(--status-info-bg)] text-[color:var(--status-info-fg)]",
  warning:
    "border-[color:var(--status-warning-border)] bg-[color:var(--status-warning-bg)] text-[color:var(--status-warning-fg)]",
  danger:
    "border-[color:var(--status-danger-border)] bg-[color:var(--status-danger-bg)] text-[color:var(--status-danger-fg)]",
  neutral:
    "border-[color:var(--status-neutral-border)] bg-[color:var(--status-neutral-bg)] text-[color:var(--status-neutral-fg)]",
};

export default function HMApprovalsPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data, loading, error, refetch } = useApiQuery<{
    pendingApprovals: PendingShortlistApproval[];
    items?: ApprovalTaskItem[];
  }>("/api/approvals");

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ApprovalFilter>(() =>
    parseApprovalFilterParam(searchParams.get("filter")),
  );

  const setFilterWithUrl = useCallback(
    (next: ApprovalFilter) => {
      setFilter(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "all") {
        params.delete("filter");
      } else {
        params.set("filter", next);
      }
      const qs = params.toString();
      router.replace(qs ? `/company/approvals?${qs}` : "/company/approvals", { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    setFilter(parseApprovalFilterParam(searchParams.get("filter")));
  }, [searchParams]);
  const [optimisticRejectedIds, setOptimisticRejectedIds] = useState<Set<string>>(new Set());
  const rejectTimersRef = useRef<Map<string, number>>(new Map());

  const pending = data?.pendingApprovals ?? [];
  const unifiedItems = useMemo<ApprovalTaskItem[]>(() => {
    if (data?.items?.length) return data.items;
    return pending.map((p) => ({
      id: `shortlist:${p.id}`,
      source: "candidate_shortlist" as const,
      createdAt: p.created_at,
      payload: p,
    }));
  }, [data?.items, pending]);
  const filteredItems = useMemo(() => {
    if (filter === "all") return unifiedItems;
    return unifiedItems.filter((item) => item.source === filter);
  }, [unifiedItems, filter]);
  const visibleItems = useMemo(
    () => filteredItems.filter((item) => !optimisticRejectedIds.has(item.id)),
    [filteredItems, optimisticRejectedIds],
  );
  const counts = useMemo(
    () => ({
      all: unifiedItems.length,
      hiring_request: unifiedItems.filter((item) => item.source === "hiring_request").length,
      offer_finance: unifiedItems.filter((item) => item.source === "offer_finance").length,
      candidate_shortlist: unifiedItems.filter((item) => item.source === "candidate_shortlist")
        .length,
    }),
    [unifiedItems],
  );
  const getFilterButtonClass = useCallback(
    (value: ApprovalFilter) => {
      if (filter !== value) {
        return "border-[var(--border)] bg-white/[0.02] text-white/60 hover:border-[var(--border-hover)] hover:bg-white/[0.04] hover:text-[var(--text)]";
      }
      if (value === "all") {
        return "border-[var(--accent)]/55 bg-[var(--accent)]/10 text-[var(--accent)]";
      }
      const tone = getApprovalSourceTone(FILTER_SOURCE[value]);
      return FILTER_ACTIVE_STYLES[tone];
    },
    [filter],
  );

  const handleDecision = useCallback(
    async (item: ApprovalTaskItem, decision: "approved" | "rejected") => {
      setActionLoading(item.id);
      setActionError(null);
      try {
        const body: Record<string, unknown> = { decision };
        if (item.source === "candidate_shortlist") {
          body.jobId = item.payload.job_id;
          body.candidateId = item.payload.candidate_id;
        } else if (item.source === "hiring_request") {
          body.requestId = item.payload.requestId;
        } else {
          body.offerId = item.payload.offerId;
        }
        const res = await fetch(`/api/approvals/tasks/${item.id}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok) {
          setActionError(json.error ?? "Action failed");
        } else {
          await refetch();
        }
      } catch {
        setActionError("Request failed");
      }
      setActionLoading(null);
    },
    [refetch],
  );

  const scheduleRejectWithUndo = useCallback(
    (item: ApprovalTaskItem) => {
      setOptimisticRejectedIds((prev) => new Set(prev).add(item.id));
      const timerId = window.setTimeout(() => {
        rejectTimersRef.current.delete(item.id);
        void handleDecision(item, "rejected");
      }, 5000);
      rejectTimersRef.current.set(item.id, timerId);
      toast({
        title: "Approval will be rejected",
        description: "Undo within 5 seconds to keep this approval in the queue.",
        tone: "warning",
        duration: 5000,
        action: {
          label: "Undo",
          onClick: () => {
            const pending = rejectTimersRef.current.get(item.id);
            if (pending) {
              window.clearTimeout(pending);
              rejectTimersRef.current.delete(item.id);
            }
            setOptimisticRejectedIds((prev) => {
              const next = new Set(prev);
              next.delete(item.id);
              return next;
            });
          },
        },
      });
    },
    [handleDecision, toast],
  );

  return (
    <>
      <PageHeader
        title="My Approvals"
        subtitle="One inbox for requisitions, offers, and candidate shortlist approvals"
      />
      {loading ? (
        <div className="space-y-3">
          <div className="card-lifted sticky top-0 z-20 overflow-x-auto bg-[var(--surface)]/85 p-0 backdrop-blur">
            <div className="flex min-w-max items-center p-1">
              <button
                type="button"
                onClick={() => setFilterWithUrl("all")}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${getFilterButtonClass("all")}`}
              >
                All Approvals
                <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs">
                  {counts.all}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFilterWithUrl("hiring_request")}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${getFilterButtonClass("hiring_request")}`}
              >
                Hiring Requisition
                <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs">
                  {counts.hiring_request}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFilterWithUrl("offer_finance")}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${getFilterButtonClass("offer_finance")}`}
              >
                Offer Approvals
                <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs">
                  {counts.offer_finance}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFilterWithUrl("candidate_shortlist")}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${getFilterButtonClass("candidate_shortlist")}`}
              >
                Adhoc Approvals
                <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs">
                  {counts.candidate_shortlist}
                </span>
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="card-lifted p-4">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="mt-3 h-3 w-2/3" />
                <Skeleton className="mt-4 h-8 w-48 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="space-y-3">
          <div className="card-lifted sticky top-0 z-20 overflow-x-auto bg-[var(--surface)]/85 p-0 backdrop-blur">
            <div className="flex min-w-max items-center p-1">
              <button
                type="button"
                onClick={() => setFilterWithUrl("all")}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${getFilterButtonClass("all")}`}
              >
                All Approvals
                <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs">
                  {counts.all}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFilterWithUrl("hiring_request")}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${getFilterButtonClass("hiring_request")}`}
              >
                Hiring Requisition
                <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs">
                  {counts.hiring_request}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFilterWithUrl("offer_finance")}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${getFilterButtonClass("offer_finance")}`}
              >
                Offer Approvals
                <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs">
                  {counts.offer_finance}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFilterWithUrl("candidate_shortlist")}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${getFilterButtonClass("candidate_shortlist")}`}
              >
                Adhoc Approvals
                <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs">
                  {counts.candidate_shortlist}
                </span>
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm text-red-400">
            {error}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="card-lifted sticky top-0 z-20 overflow-x-auto bg-[var(--surface)]/85 p-0 backdrop-blur">
            <div className="flex min-w-max items-center p-1">
              <button
                type="button"
                onClick={() => setFilterWithUrl("all")}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${getFilterButtonClass("all")}`}
              >
                All Approvals
                <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs">
                  {counts.all}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFilterWithUrl("hiring_request")}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${getFilterButtonClass("hiring_request")}`}
              >
                Hiring Requisition
                <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs">
                  {counts.hiring_request}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFilterWithUrl("offer_finance")}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${getFilterButtonClass("offer_finance")}`}
              >
                Offer Approvals
                <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs">
                  {counts.offer_finance}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFilterWithUrl("candidate_shortlist")}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${getFilterButtonClass("candidate_shortlist")}`}
              >
                Adhoc Approvals
                <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs">
                  {counts.candidate_shortlist}
                </span>
              </button>
            </div>
          </div>
          {unifiedItems.length === 0 ? (
            <div className="card-lifted flex flex-col items-center justify-center py-16">
              <CheckCircle2 size={40} className="text-emerald-400" />
              <p className="text-body mt-4 text-white/60">No pending approvals</p>
              <p className="text-body mt-1 text-sm text-white/60">
                New approval tasks will land here automatically
              </p>
            </div>
          ) : null}
          {actionError && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400">
              <AlertCircle size={16} /> {actionError}
            </div>
          )}
          {unifiedItems.length > 0 &&
            visibleItems.map((item) => {
              if (item.source === "hiring_request") {
                const req = item.payload;
                const isLoading = actionLoading === item.id;
                return (
                  <div key={item.id} className="card-lifted p-4">
                    <div className="mb-2">
                      <StatusBadge tone="info" size="sm">
                        Requisition approval
                      </StatusBadge>
                    </div>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="heading-card text-base text-[var(--text)]">
                          {req.requestTitle}
                        </h3>
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-white/60">
                          {req.reqCode ? <span className="font-mono">{req.reqCode}</span> : null}
                          {req.department ? <span>{req.department}</span> : null}
                          {req.headcount != null ? <span>{req.headcount} opening(s)</span> : null}
                          {req.budgetCtcMin != null || req.budgetCtcMax != null ? (
                            <span className="font-medium text-white/75">
                              Budget:{" "}
                              {req.budgetCtcMin != null
                                ? `₹${req.budgetCtcMin.toLocaleString("en-IN")}`
                                : "—"}
                              {" – "}
                              {req.budgetCtcMax != null
                                ? `₹${req.budgetCtcMax.toLocaleString("en-IN")}`
                                : "—"}
                            </span>
                          ) : null}
                          <span>Stage: {req.stageKey}</span>
                          {req.approverRole ? <span>Role: {req.approverRole}</span> : null}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
                      <Link
                        href={`/company/hiring-requests/${req.requestId}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-white/[0.04]"
                      >
                        Open request
                      </Link>
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => handleDecision(item, "approved")}
                        className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-5 py-2 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isLoading ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={14} />
                        )}
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => scheduleRejectWithUndo(item)}
                        className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-5 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  </div>
                );
              }

              if (item.source === "offer_finance") {
                const offer = item.payload;
                const isLoading = actionLoading === item.id;
                return (
                  <div key={item.id} className="card-lifted p-4">
                    <div className="mb-2">
                      <StatusBadge tone="warning" size="sm">
                        Offer admin approval
                      </StatusBadge>
                    </div>
                    <div className="min-w-0">
                      <h3 className="heading-card text-base text-[var(--text)]">
                        {offer.roleTitle}
                      </h3>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-white/60">
                        {offer.jobTitle ? <span>Job: {offer.jobTitle}</span> : null}
                        {offer.candidateName ? <span>Candidate: {offer.candidateName}</span> : null}
                        {offer.ctc != null ? (
                          <span className="font-medium text-white/75">
                            CTC: {offer.currency ? `${offer.currency} ` : "₹"}
                            {offer.ctc.toLocaleString("en-IN")}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
                      <Link
                        href="/company/finance"
                        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-white/[0.04]"
                      >
                        Open offer approvals
                      </Link>
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => handleDecision(item, "approved")}
                        className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-5 py-2 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isLoading ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={14} />
                        )}
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => scheduleRejectWithUndo(item)}
                        className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-5 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  </div>
                );
              }

              const pc = item.payload;
              const candidate = pc.candidates;
              const recruiterApproval = pc.approvals.find((a) => a.approver_role === "recruiter");
              const isLoading = actionLoading === item.id;

              return (
                <div key={item.id} className="card-lifted p-4">
                  <div className="mb-2">
                    <StatusBadge tone="neutral" size="sm">
                      Candidate shortlist approval
                    </StatusBadge>
                  </div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <User size={16} className="text-white/60" />
                        <h3 className="heading-card text-base text-[var(--text)]">
                          {candidate?.name ?? "Unknown Candidate"}
                        </h3>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-white/60">
                        <span className="flex items-center gap-1">
                          <Briefcase size={12} />
                          {pc.jobTitle}
                        </span>
                        {pc.fitScore != null ? (
                          <span className="font-medium text-white/75">
                            FitScore {pc.fitScore}
                            {pc.fitBand ? ` · ${pc.fitBand}` : ""}
                          </span>
                        ) : null}
                        {candidate?.location ? (
                          <span className="flex items-center gap-1">
                            <MapPin size={12} />
                            {candidate.location}
                          </span>
                        ) : null}
                        {candidate?.email ? <span>{candidate.email}</span> : null}
                      </div>
                      {candidate?.skills && candidate.skills.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {candidate.skills.slice(0, 6).map((skill) => (
                            <span
                              key={skill}
                              className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-0.5 text-xs text-white/60"
                            >
                              {skill}
                            </span>
                          ))}
                          {candidate.skills.length > 6 ? (
                            <span className="text-xs text-white/60">
                              +{candidate.skills.length - 6} more
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {recruiterApproval ? (
                        <p className="mt-2 text-xs text-emerald-400">
                          Recruiter: {recruiterApproval.decision}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
                    <Link
                      href={`/company/jobs/${pc.job_id}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-white/[0.04]"
                    >
                      Open job
                    </Link>
                    <Link
                      href={`/recruit/candidates/${pc.candidate_id}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-white/[0.04]"
                    >
                      Open candidate
                    </Link>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleDecision(item, "approved")}
                      className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-5 py-2 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isLoading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={14} />
                      )}
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => scheduleRejectWithUndo(item)}
                      className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-5 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <XCircle size={14} /> Reject
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </>
  );
}
