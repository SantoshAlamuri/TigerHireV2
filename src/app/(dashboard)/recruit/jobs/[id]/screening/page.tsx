"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Loader2,
  MessageCircle,
  MinusCircle,
  XCircle,
  ListChecks,
} from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import FitRing from "@/components/ui/FitRing";
import { filterPillClass } from "@/components/ui/filter-pill";

import type { ScreeningReviewPhase } from "@/lib/screening/fetch-job-screening-review";

type ScreeningReviewQuestion = {
  id: string;
  source: "prescreen" | "canonical";
  phase: ScreeningReviewPhase;
  text: string;
  sortOrder: number;
};

type ScreeningReviewRow = {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  applicationStatus: string;
  pipelineStageName: string;
  gateStatus: string | null;
  prescreenSessionByStage: Partial<Record<"apply" | "post_shortlist", string>>;
  postShortlistDrift: "reminder_overdue" | "close_overdue" | null;
  postShortlistAnswerCount: number;
  postShortlistQuestionCount: number;
  postShortlistFailed: boolean;
  fitScore: number | null;
  fitBand: string | null;
  scoringMethod: string | null;
  answers: Record<string, { value: string; passed: boolean | null }>;
};

type ReviewPayload = {
  jdApprovalPending?: boolean;
  questions: ScreeningReviewQuestion[];
  rows: ScreeningReviewRow[];
};

type PostShortlistPreview = {
  shortlistedTotal: number;
  withPhone: number;
  withoutPhone: number;
  screeningComplete: number;
  alreadyComplete: number;
  staleIncomplete: number;
  awaitingConsent: number;
  inProgress: number;
  timedOut: number;
  knockedOut?: number;
  eligibleToSend: number;
  postShortlistQuestionCount: number;
};

type FilterKey = "all" | "not_started" | "awaiting" | "in_progress" | "finished" | "failed";
type ScoreSort = "desc" | "asc";

/** Mutually exclusive post-shortlist WhatsApp status — counts sum to All. */
type PostShortlistBucket = Exclude<FilterKey, "all">;

const FILTER_OPTIONS: { value: FilterKey; label: string }[] = [
  { value: "all", label: "All shortlisted" },
  { value: "not_started", label: "Not started" },
  { value: "awaiting", label: "Awaiting reply" },
  { value: "in_progress", label: "In progress" },
  { value: "finished", label: "Finished" },
  { value: "failed", label: "Criteria not met" },
];

const REJECTABLE = new Set(["applied", "viewed", "shortlisted"]);

const PHASE_LABELS: Record<ScreeningReviewPhase, string> = {
  apply: "Pre-screen (at apply)",
  post_shortlist: "After shortlist",
  web_apply: "Pre-screen (web apply)",
};

// Pre-screen (apply) questions are hidden from this view for now — candidates
// answer them before scoring, so the review grid focuses on post-shortlist.
const HIDDEN_PHASES: ScreeningReviewPhase[] = ["apply"];

function phaseSessionLabel(
  state: string | undefined,
  answerCount = 0,
  questionCount = 0,
): string | null {
  if (!state) return null;
  if (questionCount > 0 && answerCount >= questionCount) return "Done";
  if (state === "complete") return "Timed out";
  if (state === "awaiting_consent") return "Invite sent";
  if (state === "awaiting_reply" || state === "reminded") return "In progress";
  return state;
}

function rowPostShortlistComplete(row: ScreeningReviewRow): boolean {
  return (
    row.postShortlistQuestionCount > 0 &&
    row.postShortlistAnswerCount >= row.postShortlistQuestionCount
  );
}

function rowCriteriaNotMet(row: ScreeningReviewRow): boolean {
  return row.postShortlistFailed || row.fitBand === "Gated Out" || row.gateStatus === "failed";
}

export function rowPostShortlistBucket(row: ScreeningReviewRow): PostShortlistBucket {
  if (rowCriteriaNotMet(row)) return "failed";
  if (rowPostShortlistComplete(row)) return "finished";

  const state = row.prescreenSessionByStage.post_shortlist;
  if (state === "awaiting_consent") return "awaiting";
  if (state === "awaiting_reply" || state === "reminded") return "in_progress";
  if (row.postShortlistAnswerCount > 0) return "in_progress";
  return "not_started";
}

function gateLabel(status: string | null): string {
  if (!status) return "—";
  switch (status) {
    case "pending":
      return "Awaiting";
    case "passed":
      return "Passed";
    case "failed":
      return "Failed";
    case "unverified":
      return "Unverified";
    default:
      return status;
  }
}

function gateClass(status: string | null): string {
  if (status === "passed") return "text-emerald-300";
  if (status === "failed") return "text-rose-300";
  if (status === "pending") return "text-amber-300";
  if (status === "unverified") return "text-white/55";
  return "text-white/45";
}

function answerCellClass(passed: boolean | null | undefined): string {
  if (passed === true) return "text-emerald-300";
  if (passed === false) return "text-rose-300 font-semibold";
  return "text-white/35";
}

function rowSortScore(row: ScreeningReviewRow): number | null {
  if (rowCriteriaNotMet(row)) return 0;
  return row.fitScore;
}

/**
 * Gate shown in the grid. applications.gate_status only reflects the apply-stage
 * gate (post-shortlist rounds are informational and never write it), so derive
 * the outcome from the answers this table actually displays; fall back to the
 * stored apply-gate when the candidate hasn't answered any visible question.
 *
 * Completion is judged per phase group: a candidate only ever sees the phases
 * their intake path went through (a CV-uploaded candidate answers post-shortlist
 * WhatsApp but never the web-apply form), so groups with zero answers are
 * ignored. Passed = every group the candidate answered in is fully answered
 * yes; failed = any knockout NO anywhere; otherwise pending.
 */
export function deriveGateStatus(
  row: ScreeningReviewRow,
  questionGroups: Array<{ questions: ScreeningReviewQuestion[] }>,
): string | null {
  if (row.gateStatus === "failed") return "failed";

  let participatedInAnyGroup = false;
  let everyParticipatedGroupPassed = true;
  for (const group of questionGroups) {
    const answers = group.questions.flatMap((q) => {
      const a = row.answers[q.id];
      return a ? [a] : [];
    });
    if (answers.some((a) => a.passed === false)) return "failed";
    if (answers.length === 0) continue; // phase never shown to this candidate
    participatedInAnyGroup = true;
    if (answers.length < group.questions.length || !answers.every((a) => a.passed === true)) {
      everyParticipatedGroupPassed = false;
    }
  }

  if (!participatedInAnyGroup) return row.gateStatus;
  return everyParticipatedGroupPassed ? "passed" : "pending";
}

function rowMatchesFilter(row: ScreeningReviewRow, filter: FilterKey): boolean {
  if (filter === "all") return true;
  return rowPostShortlistBucket(row) === filter;
}

export default function JobScreeningReviewPage() {
  const { id: jobId } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [scoreSort, setScoreSort] = useState<ScoreSort>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [forceResend, setForceResend] = useState(false);
  const [nonRespondersOnly, setNonRespondersOnly] = useState(true);

  const sendPreviewUrl = useMemo(() => {
    if (!jobId) return null;
    const params = new URLSearchParams();
    if (forceResend) params.set("forceResend", "true");
    if (forceResend && !nonRespondersOnly) params.set("nonRespondersOnly", "false");
    const qs = params.toString();
    return `/api/jobs/${jobId}/post-shortlist-send${qs ? `?${qs}` : ""}`;
  }, [jobId, forceResend, nonRespondersOnly]);

  const { data, loading, error, refetch } = useApiQuery<ReviewPayload>(
    jobId ? `/api/jobs/${jobId}/screening-review` : null,
  );

  const { data: sendPreview, refetch: refetchSendPreview } =
    useApiQuery<PostShortlistPreview>(sendPreviewUrl);

  const questions = data?.questions ?? [];
  const allRows = data?.rows ?? [];

  // The send bar counts every shortlisted pipeline candidate, while the review
  // grid drops candidates without an applications row (the row model needs an
  // applicationId for selection/reject). Fabricating rows with a null id would
  // break selection keys, so the smaller safe change is to annotate the gap.
  const shortlistedNotInGrid = Math.max(0, (sendPreview?.shortlistedTotal ?? 0) - allRows.length);

  // Machine-drift strip: open sessions sitting past a reminder/close deadline mean a
  // lifecycle cron missed them or a dispatch silently failed. Hidden when healthy.
  const driftSummary = useMemo(() => {
    const reminderOverdue = allRows.filter((r) => r.postShortlistDrift === "reminder_overdue");
    const closeOverdue = allRows.filter((r) => r.postShortlistDrift === "close_overdue");
    const names = [...closeOverdue, ...reminderOverdue].map((r) => r.candidateName);
    return { reminderOverdue: reminderOverdue.length, closeOverdue: closeOverdue.length, names };
  }, [allRows]);

  const questionGroups = useMemo(() => {
    const order: ScreeningReviewPhase[] = ["apply", "web_apply", "post_shortlist"];
    return order
      .filter((phase) => !HIDDEN_PHASES.includes(phase))
      .map((phase) => ({
        phase,
        label: PHASE_LABELS[phase],
        questions: questions.filter((q) => q.phase === phase),
      }))
      .filter((g) => g.questions.length > 0);
  }, [questions]);

  const postShortlistQuestions = useMemo(
    () => questions.filter((q) => q.phase === "post_shortlist"),
    [questions],
  );
  const visibleQuestions = useMemo(
    () => questionGroups.flatMap((g) => g.questions),
    [questionGroups],
  );

  const fixedColumnCount = 7;

  // Overwrite gateStatus with the derived value so the Gate cell, filter chips,
  // and filtering all agree with the answer columns rendered next to them.
  const gatedRows = useMemo(
    () =>
      allRows.map((row) => ({
        ...row,
        gateStatus: deriveGateStatus(row, questionGroups),
      })),
    [allRows, questionGroups],
  );

  const filteredRows = useMemo(
    () => gatedRows.filter((row) => rowMatchesFilter(row, filter)),
    [gatedRows, filter],
  );

  const displayRows = useMemo(() => {
    const rows = [...filteredRows];
    rows.sort((a, b) => {
      const scoreA = rowSortScore(a);
      const scoreB = rowSortScore(b);
      if (scoreA == null && scoreB == null) return a.candidateName.localeCompare(b.candidateName);
      if (scoreA == null) return 1;
      if (scoreB == null) return -1;
      const byScore = scoreSort === "desc" ? scoreB - scoreA : scoreA - scoreB;
      if (byScore !== 0) return byScore;
      return a.candidateName.localeCompare(b.candidateName);
    });
    return rows;
  }, [filteredRows, scoreSort]);

  const selectableRows = displayRows.filter((r) => REJECTABLE.has(r.applicationStatus));
  const selectAllChecked =
    selectableRows.length > 0 && selectableRows.every((r) => selectedIds.has(r.applicationId));

  function toggleExpand(applicationId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(applicationId)) next.delete(applicationId);
      else next.add(applicationId);
      return next;
    });
  }

  function toggleSelect(applicationId: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(applicationId);
      else next.delete(applicationId);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds(new Set(selectableRows.map((r) => r.applicationId)));
    } else {
      setSelectedIds(new Set());
    }
  }

  async function handleBulkReject() {
    if (!jobId || selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/screening-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationIds: [...selectedIds] }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        updated?: number;
        notified?: number;
        error?: string;
      };
      if (!res.ok) {
        toast({
          title: "Reject failed",
          description: json.error ?? "Could not update applications.",
          tone: "error",
        });
        return;
      }
      toast({
        title: "Applications rejected",
        description: `Rejected ${json.updated ?? 0} candidate(s); ${json.notified ?? 0} notified on WhatsApp.`,
        tone: "success",
      });
      setSelectedIds(new Set());
      await refetch();
    } catch (err) {
      toast({
        title: "Reject failed",
        description: err instanceof Error ? err.message : "Network error — please retry.",
        tone: "error",
      });
    } finally {
      setBulkLoading(false);
    }
  }

  async function handlePostShortlistSend(dryRun: boolean) {
    if (!jobId) return;
    setSendLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/post-shortlist-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dryRun,
          forceResend,
          nonRespondersOnly: forceResend ? nonRespondersOnly : undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        sent?: number;
        skipped?: number;
        failed?: number;
        reset?: number;
        eligibleToSend?: number;
        error?: string;
      };
      if (!res.ok) {
        toast({
          title: dryRun ? "Preview failed" : "Send failed",
          description: json.error ?? "Could not send post-shortlist screening.",
          tone: "error",
        });
        return;
      }
      if (dryRun) {
        toast({
          title: "Ready to send",
          description: `${json.eligibleToSend ?? 0} shortlisted candidate(s) with phone would receive WhatsApp.`,
          tone: "success",
        });
        return;
      }
      toast({
        title: "Post-shortlist invites sent",
        description: `Sent ${json.sent ?? 0}, skipped ${json.skipped ?? 0}, failed ${json.failed ?? 0}${
          json.reset ? ` · reset ${json.reset} stale session(s)` : ""
        }.`,
        tone: "success",
      });
      await Promise.all([refetch(), refetchSendPreview()]);
    } catch (err) {
      toast({
        title: "Send failed",
        description: err instanceof Error ? err.message : "Network error — please retry.",
        tone: "error",
      });
    } finally {
      setSendLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card-lifted p-8 text-center">
        <p className="text-sm text-red-400">{error}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-4 rounded-md border border-[var(--border-interactive)] px-4 py-2 text-sm text-white/65 hover:bg-white/[0.04]"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${selectedIds.size > 0 ? "pb-24" : ""}`}>
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
          <ListChecks size={20} className="text-[var(--accent)]" />
          Screening review
        </h2>
        <p className="mt-1 text-sm text-white/60">
          Shortlisted candidates only — post-shortlist WhatsApp screening answers and FitScore in
          one place.
        </p>
      </div>

      {sendPreview && sendPreview.postShortlistQuestionCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 px-4 py-3">
          <div className="min-w-0 flex-1 text-sm text-white/70">
            <span className="font-medium text-[var(--text)]">After shortlist WhatsApp</span>
            <span className="mx-2 text-white/35">·</span>
            {sendPreview.shortlistedTotal} shortlisted
            {shortlistedNotInGrid > 0 ? (
              <span
                className="text-white/45"
                title="Shortlisted on the pipeline but missing an application record, so they can't appear in the grid below."
              >
                {" "}
                ({shortlistedNotInGrid} not in grid — no application record)
              </span>
            ) : null}
            <span className="mx-1 text-white/35">·</span>
            {sendPreview.screeningComplete ?? sendPreview.alreadyComplete} finished
            <span className="mx-1 text-white/35">·</span>
            {sendPreview.awaitingConsent ?? 0} no reply
            <span className="mx-1 text-white/35">·</span>
            {sendPreview.inProgress ?? 0} in progress
            {(sendPreview.timedOut ?? 0) > 0 ? (
              <span className="text-white/45"> · {sendPreview.timedOut} timed out</span>
            ) : null}
            {(sendPreview.knockedOut ?? 0) > 0 ? (
              <span className="text-rose-300"> · {sendPreview.knockedOut} criteria not met</span>
            ) : null}
            <span className="mx-1 text-white/35">·</span>
            {sendPreview.eligibleToSend} ready to send
            {sendPreview.staleIncomplete > 0 ? (
              <span className="text-amber-300">
                {" "}
                · {sendPreview.staleIncomplete} stale invite(s)
                {!forceResend ? " — check Resend below" : ""}
              </span>
            ) : null}
            {sendPreview.withoutPhone > 0 ? (
              <span className="text-white/45"> · {sendPreview.withoutPhone} missing phone</span>
            ) : null}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-white/55">
            <input
              type="checkbox"
              checked={forceResend}
              onChange={(e) => setForceResend(e.target.checked)}
              className="rounded border-white/20"
            />
            Resend stale invites
          </label>
          {forceResend ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-white/55">
              <input
                type="checkbox"
                checked={nonRespondersOnly}
                onChange={(e) => setNonRespondersOnly(e.target.checked)}
                className="rounded border-white/20"
              />
              Non-responders only
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => handlePostShortlistSend(true)}
            disabled={sendLoading || sendPreview.eligibleToSend === 0}
            className="rounded-md border border-white/10 px-3 py-2 text-sm text-white/65 transition hover:bg-white/[0.04] disabled:opacity-50"
          >
            Preview
          </button>
          <button
            type="button"
            onClick={() => handlePostShortlistSend(false)}
            disabled={sendLoading || sendPreview.eligibleToSend === 0}
            className="flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
          >
            {sendLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <MessageCircle size={16} />
            )}
            Send to shortlisted ({sendPreview.eligibleToSend})
          </button>
        </div>
      )}

      {driftSummary.reminderOverdue + driftSummary.closeOverdue > 0 ? (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
        >
          <span className="font-semibold">Screening machine drift</span>
          <span className="mx-2 text-rose-200/50">·</span>
          {driftSummary.closeOverdue > 0 ? (
            <span>
              {driftSummary.closeOverdue} session(s) still open past the 48h timeout window
            </span>
          ) : null}
          {driftSummary.closeOverdue > 0 && driftSummary.reminderOverdue > 0 ? (
            <span className="mx-1 text-rose-200/50">·</span>
          ) : null}
          {driftSummary.reminderOverdue > 0 ? (
            <span>{driftSummary.reminderOverdue} candidate(s) past 24h with no reminder sent</span>
          ) : null}
          <span className="mx-2 text-rose-200/50">—</span>
          <span className="text-rose-100/80">
            {driftSummary.names.slice(0, 3).join(", ")}
            {driftSummary.names.length > 3 ? ` +${driftSummary.names.length - 3} more` : ""}
          </span>
          <p className="mt-1 text-xs text-rose-100/70">
            These should have been reminded or closed automatically. Use &ldquo;Resend stale
            invites&rdquo; above to retry; if this reappears, the reminder/timeout crons need a
            look.
          </p>
        </div>
      ) : null}

      {data?.jdApprovalPending ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
        >
          JD approval is pending for this job — screening question columns and scoring for new
          candidates are paused until the Ideal Profile is re-approved on the Plan tab.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              setFilter(opt.value);
              setSelectedIds(new Set());
            }}
            className={filterPillClass(filter === opt.value)}
          >
            {opt.label}
            <span className="ml-1 tabular-nums text-white/45">
              (
              {opt.value === "all"
                ? gatedRows.length
                : gatedRows.filter((r) => rowMatchesFilter(r, opt.value)).length}
              )
            </span>
          </button>
        ))}
      </div>
      <p className="text-xs text-white/40">
        Shortlisted candidates only. Each filter bucket is mutually exclusive and sums to All
        shortlisted.
      </p>

      {displayRows.length === 0 ? (
        <div className="card-lifted p-10 text-center text-sm text-white/55">
          No candidates match this filter.
        </div>
      ) : (
        <div className="card-lifted overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-white/[0.03] text-xs uppercase tracking-wider text-white/45">
                  <th className="sticky left-0 z-10 bg-[var(--surface-elevated)] px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectAllChecked}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      aria-label="Select all"
                      className="rounded border-white/20"
                    />
                  </th>
                  <th className="sticky left-10 z-10 min-w-[160px] bg-[var(--surface-elevated)] px-3 py-3">
                    Candidate
                  </th>
                  <th
                    className="px-3 py-3"
                    aria-sort={scoreSort === "desc" ? "descending" : "ascending"}
                  >
                    <button
                      type="button"
                      onClick={() => setScoreSort((prev) => (prev === "desc" ? "asc" : "desc"))}
                      className="inline-flex items-center gap-1 transition hover:text-white/75"
                      title={scoreSort === "desc" ? "Highest score first" : "Lowest score first"}
                    >
                      Score
                      {scoreSort === "desc" ? (
                        <ChevronDown size={14} className="text-[var(--accent)]" aria-hidden />
                      ) : (
                        <ChevronUp size={14} className="text-[var(--accent)]" aria-hidden />
                      )}
                    </button>
                  </th>
                  <th className="px-3 py-3">Band</th>
                  <th className="px-3 py-3">Gate</th>
                  <th className="px-3 py-3">Stage</th>
                  <th
                    className="px-3 py-3"
                    title="Post-shortlist YES answers / total WhatsApp questions"
                  >
                    PS Yes
                  </th>
                  {questionGroups.map((group) =>
                    group.questions.map((q, index) => (
                      <th
                        key={q.id}
                        className="min-w-[64px] px-3 py-3 text-center"
                        title={`${group.label}: ${q.text}`}
                      >
                        <span className="block text-[10px] font-normal normal-case text-white/35">
                          {group.phase === "post_shortlist"
                            ? "PS"
                            : group.phase === "apply"
                              ? "Pre"
                              : "Web"}
                        </span>
                        <span className="block truncate">Q{index + 1}</span>
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => {
                  const canSelect = REJECTABLE.has(row.applicationStatus);
                  const displayScore =
                    row.fitBand === "Gated Out" ? 0 : (row.fitScore ?? undefined);
                  const isExpanded = expandedIds.has(row.applicationId);
                  const postShortlistTotal =
                    row.postShortlistQuestionCount || postShortlistQuestions.length;
                  const postShortlistYesCount = postShortlistQuestions.filter(
                    (q) => row.answers[q.id]?.passed === true,
                  ).length;
                  const postShortlistHasNo = postShortlistQuestions.some(
                    (q) => row.answers[q.id]?.passed === false,
                  );
                  return (
                    <Fragment key={row.applicationId}>
                      <tr className="border-b border-[var(--border)]/60 hover:bg-white/[0.02]">
                        <td className="sticky left-0 z-10 bg-[var(--surface)] px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.applicationId)}
                            disabled={!canSelect}
                            onChange={(e) => toggleSelect(row.applicationId, e.target.checked)}
                            aria-label={`Select ${row.candidateName}`}
                            className="rounded border-white/20 disabled:opacity-40"
                          />
                        </td>
                        <td className="sticky left-10 z-10 bg-[var(--surface)] px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => toggleExpand(row.applicationId)}
                              aria-label={
                                isExpanded
                                  ? `Hide answers for ${row.candidateName}`
                                  : `Show answers for ${row.candidateName}`
                              }
                              aria-expanded={isExpanded}
                              className="rounded p-0.5 text-white/45 transition hover:bg-white/[0.06] hover:text-white/80"
                            >
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                            <Link
                              href={`/recruit/candidates/${row.candidateId}?jobId=${jobId}`}
                              className="font-medium text-[var(--accent)] hover:underline"
                            >
                              {row.candidateName}
                            </Link>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          {displayScore != null ? (
                            <FitRing score={displayScore} size={36} />
                          ) : (
                            <span className="text-white/35">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-white/75">
                          {rowCriteriaNotMet(row) ? (
                            <span
                              className="text-rose-300"
                              title="Answered no to a must-have screening question"
                            >
                              Criteria not met
                            </span>
                          ) : (
                            (row.fitBand ?? "—")
                          )}
                        </td>
                        <td className={`px-3 py-2.5 ${gateClass(row.gateStatus)}`}>
                          {gateLabel(row.gateStatus)}
                        </td>
                        <td className="px-3 py-2.5 text-white/75">{row.pipelineStageName}</td>
                        <td className="px-3 py-2.5">
                          {row.postShortlistAnswerCount > 0 || postShortlistYesCount > 0 ? (
                            <span
                              className={`font-semibold tabular-nums ${
                                postShortlistHasNo
                                  ? "text-rose-300"
                                  : rowPostShortlistComplete(row)
                                    ? "text-emerald-300"
                                    : "text-white/70"
                              }`}
                            >
                              {postShortlistYesCount}/{postShortlistTotal}
                            </span>
                          ) : (
                            <span className="text-white/35">—</span>
                          )}
                        </td>
                        {questionGroups.flatMap((group) =>
                          group.questions.map((q) => {
                            const ans = row.answers[q.id];
                            return (
                              <td
                                key={q.id}
                                className="px-3 py-2.5 text-center"
                                title={`${group.label}: ${q.text}${ans ? ` — ${ans.value}` : " — not answered"}`}
                              >
                                {ans?.passed === true ? (
                                  <CheckCircle2 size={16} className="inline text-emerald-300" />
                                ) : ans?.passed === false ? (
                                  <XCircle size={16} className="inline text-rose-300" />
                                ) : ans ? (
                                  <span className={answerCellClass(null)}>{ans.value}</span>
                                ) : (
                                  <span className="text-white/25">—</span>
                                )}
                              </td>
                            );
                          }),
                        )}
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-[var(--border)]/60 bg-white/[0.015]">
                          <td className="sticky left-0 z-10 bg-[var(--surface)]" />
                          <td
                            colSpan={fixedColumnCount - 1 + visibleQuestions.length}
                            className="px-4 py-4"
                          >
                            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/45">
                              {row.candidateName} — {row.postShortlistAnswerCount}/
                              {postShortlistTotal} post-shortlist answered
                              {row.prescreenSessionByStage.apply
                                ? ` · Pre-screen: ${
                                    row.prescreenSessionByStage.apply === "complete"
                                      ? "Done"
                                      : phaseSessionLabel(row.prescreenSessionByStage.apply)
                                  }`
                                : ""}
                              {row.prescreenSessionByStage.post_shortlist
                                ? ` · After shortlist: ${phaseSessionLabel(
                                    row.prescreenSessionByStage.post_shortlist,
                                    row.postShortlistAnswerCount,
                                    row.postShortlistQuestionCount,
                                  )}`
                                : ""}
                            </p>
                            {questionGroups.map((group) => {
                              const groupAnswered = group.questions.filter(
                                (q) => row.answers[q.id],
                              ).length;
                              return (
                                <div key={group.phase} className="mb-4 last:mb-0">
                                  <p className="mb-2 text-xs font-semibold text-white/55">
                                    {group.label} ({groupAnswered}/{group.questions.length})
                                  </p>
                                  <ol className="space-y-2.5">
                                    {group.questions.map((q, index) => {
                                      const ans = row.answers[q.id];
                                      return (
                                        <li key={q.id} className="flex items-start gap-3">
                                          <span className="mt-0.5 shrink-0">
                                            {ans?.passed === true ? (
                                              <CheckCircle2
                                                size={16}
                                                className="text-emerald-300"
                                              />
                                            ) : ans?.passed === false ? (
                                              <XCircle size={16} className="text-rose-300" />
                                            ) : (
                                              <MinusCircle size={16} className="text-white/25" />
                                            )}
                                          </span>
                                          <span className="min-w-0 text-sm">
                                            <span className="text-white/70">
                                              Q{index + 1}. {q.text}
                                            </span>
                                            <span
                                              className={`ml-2 font-medium ${answerCellClass(ans?.passed)}`}
                                            >
                                              {ans ? `→ ${ans.value}` : "→ Not answered yet"}
                                            </span>
                                          </span>
                                        </li>
                                      );
                                    })}
                                  </ol>
                                </div>
                              );
                            })}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {questionGroups.length > 0 && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)]/40 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
            Question reference
          </p>
          {questionGroups.map((group) => (
            <div key={group.phase} className="mt-3">
              <p className="text-xs font-medium text-white/55">{group.label}</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-white/70">
                {group.questions.map((q) => (
                  <li key={q.id}>{q.text}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-[var(--surface-elevated)] p-4 shadow-lg backdrop-blur-md">
          <span className="text-sm font-medium text-white">
            <span className="tabular-nums">{selectedIds.size}</span> selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkLoading}
              className="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-white/65 transition hover:bg-white/[0.04] disabled:opacity-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleBulkReject}
              disabled={bulkLoading}
              title="Rejects the selected applications and sends each candidate a polite WhatsApp rejection message"
              className="flex items-center gap-2 rounded-md bg-rose-500/15 px-4 py-2 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/25 disabled:opacity-50"
            >
              {bulkLoading ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
              Reject &amp; notify
            </button>
          </div>
        </div>
      )}

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/45">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 size={14} className="text-emerald-300" /> answered yes
        </span>
        <span className="flex items-center gap-1.5">
          <XCircle size={14} className="text-rose-300" /> answered no (knockout)
        </span>
        <span>— awaiting answer</span>
        <span>Pre = pre-screen at apply · PS = post-shortlist · Web = apply form</span>
        <span>
          Hover a mark to see the question and exact reply. Refresh after candidates reply.
        </span>
      </p>
    </div>
  );
}
