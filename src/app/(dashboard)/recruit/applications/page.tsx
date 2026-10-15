"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Inbox,
  Eye,
  Star,
  XCircle,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  MapPin,
  Heart,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import StatCard from "@/components/dashboard/StatCard";
import FitScoreAlternative from "@/components/dashboard/FitScoreAlternative";
import FitRing from "@/components/ui/FitRing";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { AMBER_OUTLINE_ACTION_CLASS, filterPillClass } from "@/components/ui/filter-pill";
import { useApiQuery, useOptimisticMutation } from "@/lib/hooks/use-api";
import { getApplicationStatusTone } from "@/lib/status-tones";
import type { ApplicationStatus } from "@/types";

const STATUS_META: Record<ApplicationStatus, { label: string }> = {
  applied: { label: "New" },
  viewed: { label: "Viewed" },
  shortlisted: { label: "Shortlisted" },
  rejected: { label: "Rejected" },
  hired: { label: "Hired" },
  withdrawn: { label: "Withdrawn" },
};

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "applied", label: "New" },
  { value: "viewed", label: "Viewed" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "rejected", label: "Rejected" },
  { value: "hired", label: "Hired" },
];

interface ApplicationRow {
  id: string;
  candidate_id: string;
  job_id: string;
  interest: string;
  cover_note: string | null;
  status: ApplicationStatus;
  viewed_at: string | null;
  created_at: string;
  jobs: {
    id: string;
    title: string;
    organisation_id: string;
    organisations: { name: string };
  } | null;
  candidates: {
    id: string;
    name: string;
    skills: string[] | null;
    experience_years: number | null;
    location: string | null;
    intent_score: number | null;
  } | null;
  fit_scores: {
    overall_score: number;
    primary_score?: number | null;
    skills_score: number | null;
    experience_score: number | null;
    shadow_score?: number | null;
    recruiter_selected?: string | null;
    signal_score?: number | null;
    grade_based_score?: number | null;
    scoring_version?: number | null;
  } | null;
}

function maskName(name: string): string {
  const parts = name.split(" ");
  if (parts.length <= 1) return name;
  return `${parts[0]} ${parts[1][0]}.`;
}

const SELECTABLE_FOR_SHORTLIST: ApplicationStatus[] = ["applied", "viewed"];
const SELECTABLE_FOR_REJECT: ApplicationStatus[] = ["applied", "viewed", "shortlisted"];

function RecruiterApplicationCard({
  app,
  onStatusPendingChange,
  onStatusCommitted,
  onRefetch,
  onOptimisticScore,
  displayedScoreOverride,
  selected,
  onToggleSelect,
}: {
  app: ApplicationRow;
  onStatusPendingChange: (id: string, status: ApplicationStatus) => void;
  onStatusCommitted: (id: string) => void;
  onRefetch?: () => void | Promise<unknown>;
  onOptimisticScore?: (appId: string, displayedScore: number) => void;
  displayedScoreOverride?: number;
  selected: boolean;
  onToggleSelect: (id: string, checked: boolean) => void;
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [delayedRejectTimer, setDelayedRejectTimer] = useState<number | null>(null);
  const [pendingStatus, setPendingStatus] = useState<ApplicationStatus | null>(null);
  const { toast } = useToast();
  const effectiveStatus = pendingStatus ?? app.status;
  const cfg = STATUS_META[effectiveStatus];
  const candidate = app.candidates;
  // Normalize: API may return fit_scores as object or single-element array
  const fitScoreRaw = app.fit_scores;
  const fitScore = Array.isArray(fitScoreRaw)
    ? ((fitScoreRaw[0] as typeof fitScoreRaw extends (infer T)[] ? T : null) ?? null)
    : fitScoreRaw;
  const job = app.jobs;
  const canSelect =
    SELECTABLE_FOR_REJECT.includes(effectiveStatus) && effectiveStatus !== "withdrawn";

  const { mutate, loading: statusUpdating } = useOptimisticMutation<
    Record<string, unknown>,
    { status: ApplicationStatus }
  >(`/api/applications/${app.id}`, {
    method: "PATCH",
    onMutate: (variables) => {
      setPendingStatus(variables.status);
      onStatusPendingChange(app.id, variables.status);
      return () => {
        setPendingStatus(null);
        onStatusCommitted(app.id);
      };
    },
    onSuccess: async () => {
      setPendingStatus(null);
      onStatusCommitted(app.id);
      await onRefetch?.();
      toast({
        title: "Application updated",
        description: "Status saved.",
        tone: "success",
      });
    },
    onError: (err, variables) => {
      setPendingStatus(null);
      toast({
        title: "Couldn't update application",
        description: err.message,
        tone: "error",
        action: {
          label: "Retry",
          onClick: () => {
            void mutate(variables);
          },
        },
      });
    },
  });

  async function commitStatus(status: ApplicationStatus) {
    await mutate({ status });
  }

  function handleStatusUpdate(nextStatus: ApplicationStatus) {
    if (nextStatus !== "rejected") {
      void commitStatus(nextStatus);
      return;
    }

    const previousStatus = app.status;
    setPendingStatus(nextStatus);
    onStatusPendingChange(app.id, nextStatus);
    const timer = window.setTimeout(() => {
      void commitStatus(nextStatus);
      setDelayedRejectTimer(null);
    }, 5000);
    setDelayedRejectTimer(timer);
    toast({
      title: "Application will be rejected",
      description: "Undo within 5 seconds to keep candidate in current stage.",
      tone: "warning",
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          if (delayedRejectTimer !== null) {
            window.clearTimeout(delayedRejectTimer);
          }
          window.clearTimeout(timer);
          setDelayedRejectTimer(null);
          setPendingStatus(null);
          onStatusPendingChange(app.id, previousStatus);
        },
      },
    });
  }

  const displayName = candidate?.name ? maskName(candidate.name) : "Unknown Candidate";
  const [firstName, ...restName] = displayName.trim().split(/\s+/);
  const trailingName = restName.join(" ");
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="card-lifted p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {canSelect ? (
            <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-white/10 transition hover:border-white/20">
              <input
                type="checkbox"
                checked={selected}
                onChange={(e) => onToggleSelect(app.id, e.target.checked)}
                className="sr-only"
                aria-label={`Select ${displayName}`}
              />
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
                  selected ? "bg-white/[0.08] text-white" : "bg-white/[0.03]"
                }`}
              >
                {selected ? (
                  <CheckCircle2 size={20} />
                ) : (
                  <span className="text-xs font-semibold text-white/65">{initials}</span>
                )}
              </span>
            </label>
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-sm font-semibold text-white/55 ring-1 ring-inset ring-white/[0.06]">
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base text-[var(--text)]">
                <span className="font-normal text-white/70">{firstName}</span>{" "}
                {trailingName ? <span className="font-extrabold">{trailingName}</span> : null}
              </h3>
              <StatusBadge tone={getApplicationStatusTone(effectiveStatus)} size="sm">
                {cfg.label}
              </StatusBadge>
              {app.interest === "strong_interest" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-2 py-0.5 text-xs font-semibold text-white/65 ring-1 ring-inset ring-white/[0.06]">
                  <Sparkles size={12} />
                  Strong Interest
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-body text-sm text-white/60">
              {job && (
                <span>
                  Applied for <span className="font-semibold text-white/70">{job.title}</span>
                </span>
              )}
              {candidate?.location && (
                <span className="flex items-center gap-1">
                  <MapPin size={12} />
                  {candidate.location}
                </span>
              )}
              {candidate?.experience_years != null && (
                <span>{candidate.experience_years}yr exp</span>
              )}
              <span className="flex items-center gap-1">
                <Clock size={12} />
                <span suppressHydrationWarning>
                  {new Date(app.created_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </span>
            </div>

            {candidate?.skills && candidate.skills.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {candidate.skills.slice(0, 6).map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-xs text-white/65"
                  >
                    {skill}
                  </span>
                ))}
                {candidate.skills.length > 6 && (
                  <span className="text-xs text-white/60">+{candidate.skills.length - 6}</span>
                )}
              </div>
            )}

            {app.cover_note && (
              <div className="mt-2 flex items-start gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
                <MessageSquare size={14} className="mt-0.5 shrink-0 text-white/60" />
                <p className="text-body text-sm italic text-white/65">{app.cover_note}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-3">
            {fitScore && (
              <FitRing score={displayedScoreOverride ?? fitScore.overall_score} size={44} />
            )}

            {effectiveStatus !== "withdrawn" && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setActionsOpen(!actionsOpen)}
                  className="flex items-center gap-1 rounded-md border border-white/10 px-3 py-1.5 text-sm font-semibold text-white/65 transition hover:bg-white/[0.04] hover:text-white"
                >
                  Actions
                  <ChevronDown
                    size={12}
                    className={`transition ${actionsOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {actionsOpen && (
                  <div className="absolute right-0 top-full z-20 mt-1 min-w-[140px] rounded-md border border-white/10 bg-[#101117] p-1 shadow-xl">
                    {effectiveStatus === "applied" && (
                      <button
                        type="button"
                        onClick={() => {
                          handleStatusUpdate("viewed");
                          setActionsOpen(false);
                        }}
                        disabled={statusUpdating}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-white/80 transition hover:bg-white/[0.04]"
                      >
                        <Eye size={14} />
                        Mark Viewed
                      </button>
                    )}
                    {(effectiveStatus === "applied" || effectiveStatus === "viewed") && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            handleStatusUpdate("shortlisted");
                            setActionsOpen(false);
                          }}
                          disabled={statusUpdating}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-emerald-300 transition hover:bg-white/[0.04]"
                        >
                          <Star size={14} />
                          Shortlist
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleStatusUpdate("rejected");
                            setActionsOpen(false);
                          }}
                          disabled={statusUpdating}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-rose-300 transition hover:bg-white/[0.04]"
                        >
                          <XCircle size={14} />
                          Reject
                        </button>
                      </>
                    )}
                    {effectiveStatus === "shortlisted" && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            handleStatusUpdate("hired");
                            setActionsOpen(false);
                          }}
                          disabled={statusUpdating}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-emerald-300 transition hover:bg-white/[0.04]"
                        >
                          <CheckCircle2 size={14} />
                          Mark as Hired
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleStatusUpdate("rejected");
                            setActionsOpen(false);
                          }}
                          disabled={statusUpdating}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-rose-300 transition hover:bg-white/[0.04]"
                        >
                          <XCircle size={14} />
                          Reject
                        </button>
                      </>
                    )}
                    {effectiveStatus === "rejected" && (
                      <button
                        type="button"
                        onClick={() => {
                          handleStatusUpdate("shortlisted");
                          setActionsOpen(false);
                        }}
                        disabled={statusUpdating}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-emerald-300 transition hover:bg-white/[0.04]"
                      >
                        <Star size={14} />
                        Reconsider
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          {fitScore &&
            (() => {
              const isV2 = (fitScore.scoring_version ?? 1) >= 2;
              const sig = fitScore.signal_score;
              const grade = fitScore.grade_based_score;
              const derivedPrimary = isV2
                ? null
                : (fitScore.primary_score ??
                  (sig != null && grade != null ? Math.round(0.2 * sig + 0.8 * grade) : null));
              const derivedShadow = isV2
                ? null
                : (fitScore.shadow_score ??
                  (sig != null && grade != null ? Math.round(0.4 * sig + 0.6 * grade) : null));
              const hasAlternativeScore =
                derivedShadow != null &&
                derivedShadow !== (derivedPrimary ?? fitScore.overall_score);
              if (hasAlternativeScore && derivedShadow != null) {
                return (
                  <FitScoreAlternative
                    jobId={app.job_id}
                    candidateId={app.candidate_id}
                    primaryScore={derivedPrimary ?? fitScore.overall_score}
                    shadowScore={derivedShadow}
                    recruiterSelected={
                      (fitScore.recruiter_selected as "primary" | "shadow") ?? undefined
                    }
                    onRefetch={onRefetch}
                    onSelectionSaved={(_, score) => onOptimisticScore?.(app.id, score)}
                  />
                );
              }
              return (
                <div className="flex flex-col items-end gap-0.5 text-xs text-white/65">
                  <span>Alternative (40/60)</span>
                  <Link
                    href={`/recruit/jobs/${app.job_id}`}
                    className="text-[var(--accent)] hover:underline"
                  >
                    Recompute job scores to see
                  </Link>
                </div>
              );
            })()}
        </div>
      </div>
    </div>
  );
}

/**
 * Applications list. Renders the org-wide inbound applications when `jobId` is omitted, or a
 * single job's applications (scoped via the API's jobId filter) when embedded in the job
 * workspace. When scoped, the page-level header is suppressed because the job layout supplies it.
 */
export function RecruiterApplicationsList({ jobId }: { jobId?: string }) {
  const [filter, setFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [optimisticStatusByAppId, setOptimisticStatusByAppId] = useState<
    Record<string, ApplicationStatus>
  >({});
  /** Optimistic displayed score per application so badge updates immediately when "Use this score" is clicked. */
  const [optimisticScoreByAppId, setOptimisticScoreByAppId] = useState<Record<string, number>>({});

  const {
    data: allData,
    loading: allLoading,
    error: allError,
    refetch: refetchAll,
  } = useApiQuery<{
    applications: ApplicationRow[];
    pagination: { total: number };
  }>("/api/applications", { limit: 100, ...(jobId ? { jobId } : {}) });

  const {
    data: filteredData,
    loading: filteredLoading,
    error: filteredError,
    refetch: refetchFiltered,
  } = useApiQuery<{
    applications: ApplicationRow[];
    pagination: { total: number };
  }>(
    "/api/applications",
    filter !== "all"
      ? { status: filter, limit: 100, ...(jobId ? { jobId } : {}) }
      : { limit: 100, ...(jobId ? { jobId } : {}) },
  );

  const allApps = allData?.applications ?? [];
  const baseDisplayApps = filter === "all" ? allApps : (filteredData?.applications ?? []);
  const displayApps = useMemo(
    () =>
      baseDisplayApps.map((app) =>
        optimisticStatusByAppId[app.id] ? { ...app, status: optimisticStatusByAppId[app.id] } : app,
      ),
    [baseDisplayApps, optimisticStatusByAppId],
  );
  const totalAll = allData?.pagination?.total ?? 0;
  const loading = allLoading || (filter !== "all" && filteredLoading);
  const listError = allError ?? (filter !== "all" ? filteredError : null);

  async function handleRetryList() {
    await Promise.all([refetchAll(), refetchFiltered()]);
  }

  const counts = useMemo(() => {
    const c = { applied: 0, viewed: 0, shortlisted: 0, rejected: 0, hired: 0 };
    allApps.forEach((a) => {
      if (a.status in c) c[a.status as keyof typeof c]++;
    });
    return c;
  }, [allApps]);

  const selectableApps = displayApps.filter((a) => SELECTABLE_FOR_REJECT.includes(a.status));
  const selectedApps = displayApps.filter((a) => selectedIds.has(a.id));
  const allSelectedForShortlist =
    selectedApps.length > 0 &&
    selectedApps.every((a) => SELECTABLE_FOR_SHORTLIST.includes(a.status));
  const shortlistCount = selectedApps.filter((a) =>
    SELECTABLE_FOR_SHORTLIST.includes(a.status),
  ).length;

  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds(new Set(selectableApps.map((a) => a.id)));
    } else {
      setSelectedIds(new Set());
    }
  }

  const selectAllChecked =
    selectableApps.length > 0 && selectableApps.every((a) => selectedIds.has(a.id));

  function handleStatusPendingChange(id: string, status: ApplicationStatus) {
    setOptimisticStatusByAppId((prev) => ({ ...prev, [id]: status }));
  }

  function handleStatusCommitted(id: string) {
    setOptimisticStatusByAppId((prev) => {
      if (!prev[id]) return prev;
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  }

  async function handleBulkShortlist() {
    const ids = selectedApps
      .filter((a) => SELECTABLE_FOR_SHORTLIST.includes(a.status))
      .map((a) => a.id);
    if (ids.length === 0) return;
    setBulkLoading(true);
    try {
      for (const id of ids) {
        await fetch(`/api/applications/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "shortlisted" }),
        });
      }
      setSelectedIds(new Set());
      await Promise.all([refetchAll(), filter !== "all" ? refetchFiltered() : Promise.resolve()]);
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkReject() {
    const ids = selectedApps
      .filter((a) => SELECTABLE_FOR_REJECT.includes(a.status))
      .map((a) => a.id);
    if (ids.length === 0) return;

    // Each rejection sends the candidate an email AND a WhatsApp, and there is no
    // undo. Confirm explicitly and say exactly what will be sent — previously this
    // fired on a single click with no warning and never checked the responses.
    const confirmed = window.confirm(
      `Reject ${ids.length} candidate${ids.length === 1 ? "" : "s"}?\n\n` +
        `${ids.length} rejection email${ids.length === 1 ? "" : "s"} and WhatsApp ` +
        `message${ids.length === 1 ? "" : "s"} will be sent immediately. This cannot be undone.`,
    );
    if (!confirmed) return;

    setBulkLoading(true);
    try {
      let succeeded = 0;
      const failedIds: string[] = [];
      for (const id of ids) {
        try {
          const res = await fetch(`/api/applications/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "rejected" }),
          });
          if (res.ok) succeeded += 1;
          else failedIds.push(id);
        } catch {
          failedIds.push(id);
        }
      }
      // Partial failure was previously invisible: the loop ignored every response.
      if (failedIds.length > 0) {
        setBulkError(
          `Rejected ${succeeded} of ${ids.length}. ${failedIds.length} failed — those candidates were not notified. Try again for the remaining selection.`,
        );
        setSelectedIds(new Set(failedIds));
      } else {
        setBulkError(null);
        setSelectedIds(new Set());
      }
      await Promise.all([refetchAll(), filter !== "all" ? refetchFiltered() : Promise.resolve()]);
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <>
      {!jobId ? (
        <PageHeader
          title="Applications"
          subtitle="Inbound applicants only. Use Pipeline for shortlisted candidates, interviews, feedback, and hiring decisions."
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link href="/recruit/pipeline" className={AMBER_OUTLINE_ACTION_CLASS}>
                Open pipeline
              </Link>
              <Link href="/recruit/jobs" className={filterPillClass(false)}>
                Jobs
              </Link>
            </div>
          }
        />
      ) : null}
      {loading ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="card-lifted p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-7 w-16" />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-full" />
            ))}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card-lifted p-4">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="mt-3 h-3 w-2/3" />
              </div>
            ))}
          </div>
        </div>
      ) : listError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 py-14">
          <p className="px-4 text-center text-sm text-red-400">{listError}</p>
          <button
            type="button"
            onClick={() => void handleRetryList()}
            className="rounded-md border border-white/10 px-4 py-2 text-sm text-white/65 transition hover:bg-white/[0.04] hover:text-white"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Total Applications" value={totalAll} icon={<Inbox size={20} />} />
            <StatCard label="New / Unread" value={counts.applied} icon={<Heart size={20} />} />
            <StatCard label="Shortlisted" value={counts.shortlisted} icon={<Star size={20} />} />
            <StatCard label="Hired" value={counts.hired} icon={<CheckCircle2 size={20} />} />
            <StatCard label="Rejected" value={counts.rejected} icon={<XCircle size={20} />} />
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilter(opt.value)}
                className={filterPillClass(filter === opt.value)}
              >
                {opt.label}
                {opt.value === "applied" && counts.applied > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white/[0.08] px-1 text-label font-bold text-white tabular-nums">
                    {counts.applied}
                  </span>
                )}
              </button>
            ))}
          </div>

          {displayApps.length === 0 ? (
            <div className="card-lifted mx-auto max-w-md px-6 py-16 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-500/10 text-white/45">
                <Inbox className="h-7 w-7" />
              </div>
              <h2 className="mt-4 text-base font-semibold text-[var(--text)]">
                {filter === "all" ? "No applications yet" : "Nothing matches this filter"}
              </h2>
              <p className="text-body mt-2 text-sm text-white/65">
                {filter === "all"
                  ? "When candidates apply to your published roles, they show up here with status, FitScore, and quick actions."
                  : `No applications with status “${FILTER_OPTIONS.find((f) => f.value === filter)?.label ?? filter}” right now. Try All or another tab.`}
              </p>
              {filter === "all" && (
                <div className="mt-6 flex flex-col items-stretch sm:items-center">
                  <Link
                    href="/recruit/jobs"
                    className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
                  >
                    View job postings
                  </Link>
                </div>
              )}
              {filter !== "all" && (
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className="inline-flex items-center justify-center rounded-md border border-white/10 px-5 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/[0.04] hover:text-white"
                  >
                    Show all applications
                  </button>
                  <Link
                    href="/recruit/jobs"
                    className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
                  >
                    Check jobs are live
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <>
              {selectableApps.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-white/80">
                    <input
                      type="checkbox"
                      checked={selectAllChecked}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      className="h-4 w-4 rounded border-white/10 text-white focus:ring-white/20"
                      aria-label="Select all on this page"
                    />
                    Select all (<span className="tabular-nums">{selectableApps.length}</span>)
                  </label>
                </div>
              )}
              <div className="space-y-2">
                {displayApps.map((app) => (
                  <RecruiterApplicationCard
                    key={app.id}
                    app={app}
                    onStatusPendingChange={handleStatusPendingChange}
                    onStatusCommitted={handleStatusCommitted}
                    onRefetch={async () => {
                      await Promise.all([
                        refetchAll(),
                        filter !== "all" ? refetchFiltered() : Promise.resolve(),
                      ]);
                      setOptimisticStatusByAppId({});
                      setOptimisticScoreByAppId({});
                    }}
                    onOptimisticScore={(appId, score) =>
                      setOptimisticScoreByAppId((prev) => ({ ...prev, [appId]: score }))
                    }
                    displayedScoreOverride={optimisticScoreByAppId[app.id]}
                    selected={selectedIds.has(app.id)}
                    onToggleSelect={toggleSelect}
                  />
                ))}
              </div>
              {selectedIds.size > 0 && (
                <div className="sticky bottom-4 left-0 right-0 z-10 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 shadow-lg">
                  <span className="text-sm font-medium text-white">
                    <span className="tabular-nums">{selectedIds.size}</span> selected
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedIds(new Set())}
                      disabled={bulkLoading}
                      className="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-white/65 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkShortlist}
                      disabled={bulkLoading || !allSelectedForShortlist}
                      className="flex items-center gap-2 rounded-md bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {bulkLoading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Star size={16} />
                      )}
                      Shortlist (<span className="tabular-nums">{shortlistCount}</span>)
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkReject}
                      disabled={bulkLoading}
                      className="flex items-center gap-2 rounded-md bg-rose-500/15 px-4 py-2 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {bulkLoading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <XCircle size={16} />
                      )}
                      Reject (<span className="tabular-nums">{selectedIds.size}</span>)
                    </button>
                  </div>
                  {bulkError && (
                    <p
                      role="alert"
                      className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
                    >
                      {bulkError}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

/** Org-wide applications inbox route (kept for deep links; removed from primary nav). */
export default function RecruiterApplicationsPage() {
  return <RecruiterApplicationsList />;
}
