"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, MoreHorizontal, Trophy, Calendar, Mail, Phone, X, Link2 } from "lucide-react";
import { fetchPipelineStages, type PipelineStage } from "@/lib/api/fetch-pipeline-stages";
import { FitScoreHoverCard } from "@/components/dashboard/FitScoreHoverCard";
import { PipelineMoatBadges } from "@/components/dashboard/CandidateMoatSignals";
import { JoiningDateField } from "./JoiningDateField";

export interface PipelineCandidate {
  id: string;
  job_id: string;
  candidate_id: string;
  stage_id: string | null;
  status: string;
  interview_scheduled_at: string | null;
  interview_outcome: string | null;
  recruiter_rating: number | null;
  created_at: string;
  /** Actual first day; day-90 referral anchor. Absent on DBs without the migration. */
  joined_at?: string | null;
  candidates: {
    id: string;
    name: string | null;
    email: string | null;
    phone?: string | null;
    skills: string[] | null;
    location: string | null;
    experience_years: number | null;
    current_role: string | null;
    role_title?: string | null;
  } | null;
  jobTitle: string;
  jobCompensationMin: number | null;
  jobCompensationMax: number | null;
  jobRoleFunction: string | null;
  stageName: string | null;
  stageOrder?: number | null;
  approvals: {
    approver_role: string;
    decision: string;
    decided_at: string;
  }[];
  overallScore?: number | null;
  primaryScore?: number | null;
  shadowScore?: number | null;
  recruiterSelected?: string | null;
  oneLineSummary?: string | null;
  keyStrengths?: string[] | null;
  keyGaps?: string[] | null;
  confidence?: string | null;
  band?: string | null;
  scoring_status?: "scored" | "deferred" | "failed" | null;
  greenFlags?: string[] | null;
  redFlags?: string[] | null;
  criteriaBreakdown?: Array<{
    criterion_name?: string;
    grade?: string;
    weight?: number;
    points_earned?: number;
    evidence_text?: string;
    reasoning?: string;
  }> | null;
  matchedKeywords?: string[] | null;
  evidenceSnapshot?: Record<string, unknown> | null;
  provenanceHash?: string | null;
  marketScore?: number | null;
  idealMatch?: number | null;
  source?: string | null;
  referrer_name?: string | null;
  referrer_type?: string | null;
  referrer_org_verified?: boolean;
  referrer_verified_org_name?: string | null;
  parent_referrer_name?: string | null;
  vouch_count?: number;
  vouches?: Array<{ voucher_name?: string | null; relationship_type?: string | null }>;
  currentCtcLpa?: number | null;
  expectedCtcLpa?: number | null;
  noticePeriodDays?: number | null;
  offersInHand?: number | null;
  availableFrom?: string | null;
  relocationWillingness?: string | null;
  /** `referrers.id` when this application has a direct referrer */
  referrer_id?: string | null;
  application_id?: string | null;
  sla_health?: "green" | "amber" | "red" | null;
  sla_days_in_stage?: number | null;
  sla_overdue_days?: number | null;
  billing_ctc_required?: boolean;
}

export const STATUS_ORDER = ["shortlisted", "in_progress", "hired", "rejected"] as const;

export const PIPELINE_STATUS_META: Record<string, { label: string }> = {
  shortlisted: { label: "Shortlisted" },
  in_progress: { label: "In Progress" },
  hired: { label: "Hired" },
  rejected: { label: "Rejected" },
};

type MenuItem =
  | { type: "status"; status: string; label: string; color: string }
  | { type: "stage_move"; label: string }
  | {
      type: "outcome";
      outcome: "hired" | "rejected";
      label: string;
      color: string;
    }
  | { type: "interview"; label: string }
  | { type: "scheduling_link"; label: string };

export type { PipelineStage };

function toTitleCase(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatLpa(value: number): string {
  return Number.isInteger(value) ? `${value} LPA` : `${value.toFixed(1)} LPA`;
}

type ScoreColumnId = "fit" | "market" | "ideal";

export type PipelineScoreColumn = {
  id: ScoreColumnId;
  label: string;
  value: number;
  valueClass: string;
  barTrackClass: string;
  barFillClass: string;
};

export function buildPipelineScoreColumns(pc: {
  overallScore?: number | null;
  marketScore?: number | null;
  idealMatch?: number | null;
  band?: string | null;
  confidence?: string | null;
  keyStrengths?: string[] | null;
  keyGaps?: string[] | null;
  greenFlags?: string[] | null;
  redFlags?: string[] | null;
}): PipelineScoreColumn[] {
  const columns: PipelineScoreColumn[] = [];
  if (pc.overallScore != null) {
    columns.push({
      id: "fit",
      label: "Fit",
      value: Math.round(pc.overallScore),
      valueClass: "text-emerald-400",
      barTrackClass: "bg-emerald-500/20",
      barFillClass: "bg-emerald-400",
    });
  }
  if (pc.marketScore != null) {
    columns.push({
      id: "market",
      label: "Market",
      value: Math.round(pc.marketScore),
      valueClass: "text-sky-300",
      barTrackClass: "bg-sky-500/20",
      barFillClass: "bg-sky-300",
    });
  }
  if (pc.idealMatch != null) {
    columns.push({
      id: "ideal",
      label: "Ideal",
      value: Math.round(pc.idealMatch),
      valueClass: "text-violet-300",
      barTrackClass: "bg-violet-500/20",
      barFillClass: "bg-violet-300",
    });
  }
  return columns;
}

function criteriaPercent(item: {
  weight?: number;
  points_earned?: number;
  grade?: string;
}): number {
  const byPoints =
    typeof item.weight === "number" && item.weight > 0 && typeof item.points_earned === "number"
      ? Math.max(0, Math.min(100, Math.round((item.points_earned / item.weight) * 100)))
      : 0;
  if (byPoints > 0) return byPoints;
  const grade = String(item.grade ?? "E").toUpperCase();
  if (grade === "A") return 100;
  if (grade === "B") return 75;
  if (grade === "C") return 50;
  if (grade === "D") return 25;
  return 0;
}

export function PipelineCard({
  pc,
  onStatusChange,
  onMoveStage,
  onOutcomeLog,
  onRequestInterview,
  onSendSchedulingLink,
  updating,
  outcomeLogging,
  outcomeLogged,
  interviewRequesting,
  interviewSuccess,
  schedulingLinkSending,
  schedulingLinkSuccess,
  allowReferrerMessage,
  readOnly = false,
  selected = false,
  selectionMode = false,
  onToggleSelect,
}: {
  pc: PipelineCandidate;
  onStatusChange: (pcId: string, jobId: string, status: string) => void;
  onMoveStage?: (jobId: string, pipelineCandidateId: string, stageId: string) => Promise<void>;
  onOutcomeLog?: (jobId: string, candidateId: string, outcome: "hired" | "rejected") => void;
  onRequestInterview?: (jobId: string, candidateId: string, stageId?: string) => Promise<void>;
  onSendSchedulingLink?: (jobId: string, pipelineCandidateId: string) => Promise<void>;
  updating: string | null;
  outcomeLogging?: string | null;
  outcomeLogged?: string | null;
  interviewRequesting?: string | null;
  interviewSuccess?: string | null;
  schedulingLinkSending?: string | null;
  schedulingLinkSuccess?: string | null;
  allowReferrerMessage?: boolean;
  readOnly?: boolean;
  selected?: boolean;
  /** When true, show the card checkbox for bulk selection (toolbar toggles this). */
  selectionMode?: boolean;
  onToggleSelect?: (selected: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [interviewPopoverOpen, setInterviewPopoverOpen] = useState(false);
  const [stageMovePopoverOpen, setStageMovePopoverOpen] = useState(false);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [stagesLoading, setStagesLoading] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string | undefined>();
  const [stageMoveLoading, setStageMoveLoading] = useState(false);
  const [stageMoveSelection, setStageMoveSelection] = useState<string>("");
  const [stageMoveNotice, setStageMoveNotice] = useState<string | null>(null);

  // Close the three-dots menu + popovers on outside click / Escape (Pipeline #6).
  const menuWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen && !interviewPopoverOpen && !stageMovePopoverOpen) return;
    const closeAll = () => {
      setMenuOpen(false);
      setInterviewPopoverOpen(false);
      setStageMovePopoverOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) closeAll();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, interviewPopoverOpen, stageMovePopoverOpen]);
  const candidate = pc.candidates;
  const isInterviewRequesting = interviewRequesting === pc.id;
  const justRequestedInterview = interviewSuccess === pc.id;
  const isSchedulingLinkSending = schedulingLinkSending === pc.id;
  const justSentSchedulingLink = schedulingLinkSuccess === pc.id;

  const openInterviewPopover = useCallback(() => {
    setInterviewPopoverOpen(true);
    if (!onRequestInterview) return;
    setStagesLoading(true);
    setStages([]);
    setSelectedStageId(undefined);
    fetchPipelineStages(pc.job_id)
      .then((list) => {
        setStages(list);
        setSelectedStageId(undefined);
      })
      .catch(() => {
        setStages([]);
        setSelectedStageId(undefined);
      })
      .finally(() => setStagesLoading(false));
  }, [pc.job_id, onRequestInterview]);

  const handleRequestInterviewSubmit = useCallback(() => {
    if (!onRequestInterview) return;
    onRequestInterview(pc.job_id, pc.candidate_id, selectedStageId);
    setInterviewPopoverOpen(false);
  }, [onRequestInterview, pc.job_id, pc.candidate_id, selectedStageId]);

  const openStageMovePopover = useCallback(() => {
    if (!onMoveStage) return;
    setStageMovePopoverOpen(true);
    setStageMoveNotice(null);
    setStagesLoading(true);
    fetchPipelineStages(pc.job_id, { forceFresh: true })
      .then((list) => {
        const alternatives = list.filter((s) => s.id !== pc.stage_id);
        setStages(alternatives);
        setStageMoveSelection(alternatives[0]?.id ?? "");
      })
      .catch(() => {
        setStages([]);
        setStageMoveSelection("");
      })
      .finally(() => setStagesLoading(false));
  }, [onMoveStage, pc.job_id, pc.stage_id]);

  const submitStageMove = useCallback(async () => {
    if (!onMoveStage) return;
    if (!stageMoveSelection) {
      setStageMoveNotice("Select a stage first.");
      return;
    }
    if (stageMoveSelection === pc.stage_id) {
      setStageMoveNotice("Candidate is already in that stage.");
      return;
    }
    setStageMoveLoading(true);
    setStageMoveNotice(null);
    try {
      await onMoveStage(pc.job_id, pc.id, stageMoveSelection);
      setStageMoveNotice("Stage moved.");
      setStageMovePopoverOpen(false);
      setMenuOpen(false);
    } catch {
      setStageMoveNotice("Could not move stage. Please retry.");
    } finally {
      setStageMoveLoading(false);
    }
  }, [onMoveStage, pc.id, pc.job_id, pc.stage_id, stageMoveSelection]);

  const displayName = candidate?.name ?? "Unknown Candidate";
  const isUpdating = updating === pc.id;
  const isOutcomeLogging = outcomeLogging === pc.id;
  const justLogged = outcomeLogged === pc.id;

  const menuItems = useMemo((): MenuItem[] => {
    if (readOnly) return [];
    switch (pc.status) {
      case "shortlisted":
        return [
          {
            type: "stage_move",
            label: "Move stage...",
          },
          {
            type: "status",
            status: "in_progress",
            label: "Move to In Progress",
            color: "text-amber-400",
          },
          {
            type: "status",
            status: "rejected",
            label: "Reject",
            color: "text-red-400",
          },
        ];
      case "active":
      case "in_progress":
        return [
          {
            type: "stage_move",
            label: "Move stage...",
          },
          {
            type: "interview",
            label: "Request Interview (WhatsApp)",
          },
          ...(candidate?.email?.trim() && onSendSchedulingLink
            ? [{ type: "scheduling_link" as const, label: "Send scheduling link (email)" }]
            : []),
          {
            type: "status",
            status: "hired",
            label: "Mark as Hired",
            color: "text-emerald-400",
          },
          {
            type: "status",
            status: "rejected",
            label: "Reject",
            color: "text-red-400",
          },
        ];
      case "rejected":
        return [
          {
            type: "stage_move",
            label: "Move stage...",
          },
          {
            type: "status",
            status: "shortlisted",
            label: "Reconsider",
            color: "text-blue-400",
          },
          {
            type: "outcome",
            outcome: "rejected",
            label: "Log as Rejected",
            color: "text-red-400",
          },
        ];
      case "hired":
        return [
          {
            type: "stage_move",
            label: "Move stage...",
          },
          {
            type: "outcome",
            outcome: "hired",
            label: "Log as Hired",
            color: "text-emerald-400",
          },
        ];
      default:
        return onMoveStage
          ? [
              {
                type: "stage_move",
                label: "Move stage...",
              },
            ]
          : [];
    }
  }, [onMoveStage, onSendSchedulingLink, pc.status, readOnly, candidate?.email]);

  const scoreColumns = useMemo(() => buildPipelineScoreColumns(pc), [pc]);
  const fitColumn = scoreColumns.find((column) => column.id === "fit");
  const emailDisplay = candidate?.email?.trim() || "No email on file";
  const emailTitle = candidate?.email?.trim() ? candidate.email.trim() : undefined;
  const candidateDetailsId = candidate?.id ?? pc.candidate_id ?? null;
  const candidateDetailsHref = candidateDetailsId
    ? `/recruit/candidates/${candidateDetailsId}`
    : null;
  const experienceLabel =
    candidate?.experience_years != null ? `${candidate.experience_years}y` : null;
  const roleLine = [
    candidate?.current_role ?? candidate?.role_title,
    experienceLabel,
    candidate?.location,
  ]
    .filter((v): v is string => Boolean(v))
    .join(" · ");
  const hasReasoning =
    (pc.criteriaBreakdown?.length ?? 0) > 0 ||
    (pc.keyStrengths?.length ?? 0) > 0 ||
    (pc.keyGaps?.length ?? 0) > 0 ||
    (pc.greenFlags?.length ?? 0) > 0 ||
    (pc.redFlags?.length ?? 0) > 0 ||
    (pc.matchedKeywords?.length ?? 0) > 0 ||
    Boolean(pc.provenanceHash) ||
    Boolean(pc.oneLineSummary);
  const daysInStage = Math.max(0, Math.round(pc.sla_days_in_stage ?? 0));
  const openCandidateDetails = useCallback(() => {
    if (!candidateDetailsHref) return;
    const currentPath =
      typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "";
    const query = new URLSearchParams();
    query.set("from", "pipeline");
    if (
      currentPath.startsWith("/recruit/pipeline") ||
      currentPath.startsWith("/company/my-pipeline")
    ) {
      query.set("returnTo", currentPath);
    }
    router.push(`${candidateDetailsHref}?${query.toString()}`);
  }, [candidateDetailsHref, router]);
  const openJobMatches = useCallback(() => {
    router.push(`/recruit/jobs/${pc.job_id}/matches`);
  }, [pc.job_id, router]);

  return (
    <div className="space-y-2">
      <div
        role={candidateDetailsHref ? "button" : undefined}
        tabIndex={candidateDetailsHref ? 0 : undefined}
        className={`space-y-3 card-lifted p-4 backdrop-blur-md transition hover:border-[var(--accent)]/30 ${
          candidateDetailsHref ? "cursor-pointer" : ""
        }`}
        onClick={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest('[data-no-card-nav="true"]')) return;
          openCandidateDetails();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          const target = event.target as HTMLElement | null;
          if (target?.closest('[data-no-card-nav="true"]')) return;
          event.preventDefault();
          openCandidateDetails();
        }}
      >
        <div className="relative">
          {selectionMode && onToggleSelect ? (
            <input
              type="checkbox"
              checked={selected}
              aria-label={`Select ${displayName}`}
              data-testid="pipeline-card-select-checkbox"
              data-no-card-nav="true"
              onChange={(e) => onToggleSelect(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              className="absolute right-8 top-0 z-10 h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]"
            />
          ) : null}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <p className="heading-card truncate text-xl font-semibold text-[var(--text)]">
                  {displayName}
                </p>
                <PipelineMoatBadges
                  vouchCount={pc.vouch_count}
                  vouches={pc.vouches}
                  referrerName={pc.referrer_name}
                  referrerOrgVerified={pc.referrer_org_verified}
                  referrerVerifiedOrgName={pc.referrer_verified_org_name}
                  parentReferrerName={pc.parent_referrer_name}
                />
                {pc.billing_ctc_required && (
                  <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                    Add CTC for billing
                  </span>
                )}
                {pc.shadowScore != null && pc.shadowScore !== pc.overallScore && (
                  <span
                    title="Shadow score (40% signal / 60% grade)"
                    className="shrink-0 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-400 tabular-nums"
                  >
                    S:{pc.shadowScore}
                  </span>
                )}
              </div>
              {roleLine ? <p className="mt-1 text-sm text-white/60">{roleLine}</p> : null}
              <div className="mt-2 flex flex-wrap items-center gap-2" data-no-card-nav="true">
                <span
                  className="min-w-0 break-words text-xs text-white/70"
                  title={pc.jobTitle}
                  data-testid="pipeline-card-job-title"
                >
                  Job: {pc.jobTitle}
                </span>
                {(pathname?.startsWith("/recruit") || pathname?.startsWith("/company")) && (
                  <button
                    type="button"
                    onClick={openJobMatches}
                    className="shrink-0 rounded-full border border-[var(--border)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--accent)] transition hover:bg-white/[0.04]"
                  >
                    Matches
                  </button>
                )}
              </div>
              <div className="my-3 h-px w-full bg-[var(--border)]" />
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-sm text-[var(--text)]">
                  <Mail size={14} className="mt-0.5 shrink-0 text-white/60" />
                  <span
                    className="min-w-0 break-all"
                    title={emailTitle}
                    data-testid="pipeline-card-email"
                  >
                    {emailDisplay}
                  </span>
                </div>
                <div className="flex items-start gap-2 text-sm text-[var(--text)]">
                  <Phone size={14} className="mt-0.5 shrink-0 text-white/60" />
                  <span className="min-w-0 break-all">
                    {candidate?.phone?.trim() || "Phone not available"}
                  </span>
                </div>
              </div>
              <div className="my-3 h-px w-full bg-[var(--border)]" />
              {scoreColumns.length > 0 ? (
                <div
                  className="grid gap-3"
                  data-testid="pipeline-score-grid"
                  style={{
                    gridTemplateColumns: `repeat(${scoreColumns.length}, minmax(0, 1fr))`,
                  }}
                >
                  {scoreColumns.map((column) => (
                    <div key={column.id}>
                      <div className={column.id === "fit" ? "group relative" : undefined}>
                        <p className={`text-xl font-semibold tabular-nums ${column.valueClass}`}>
                          {column.value}
                        </p>
                        {column.id === "fit" && fitColumn ? (
                          <FitScoreHoverCard
                            band={pc.band ?? null}
                            confidence={pc.confidence ?? null}
                            strengths={pc.keyStrengths ?? pc.greenFlags ?? null}
                            gaps={pc.keyGaps ?? pc.redFlags ?? null}
                          />
                        ) : null}
                      </div>
                      <p className="text-[11px] uppercase tracking-wide text-white/60">
                        {column.label}
                      </p>
                      <div className={`mt-1 h-1.5 rounded-full ${column.barTrackClass}`}>
                        <div
                          className={`h-full rounded-full ${column.barFillClass}`}
                          style={{ width: `${column.value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {hasReasoning && (
                <button
                  type="button"
                  data-no-card-nav="true"
                  onClick={() => setReasoningOpen(true)}
                  className="mt-3 rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium text-white/60 transition hover:bg-white/[0.04] hover:text-[var(--text)]"
                >
                  View score reasoning
                </button>
              )}
              {pc.status === "hired" && !readOnly ? (
                <JoiningDateField pipelineCandidateId={pc.id} joinedAt={pc.joined_at ?? null} />
              ) : null}
              <div className="my-3 h-px w-full bg-[var(--border)]" />
              <p
                className={`text-sm font-semibold ${
                  pc.sla_health === "red"
                    ? "text-red-400"
                    : pc.sla_health === "amber"
                      ? "text-amber-300"
                      : "text-white/60"
                }`}
              >
                {daysInStage}d in stage
              </p>
            </div>

            <div className="flex items-center gap-1" data-no-card-nav="true">
              {(justLogged || justRequestedInterview) && (
                <span className="text-xs text-emerald-400">
                  {justRequestedInterview ? "Request sent" : "Logged"}
                </span>
              )}
              {menuItems.length > 0 && (
                <div className="relative" ref={menuWrapRef}>
                  <button
                    type="button"
                    aria-label="Change status"
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="rounded-md p-1 text-white/60 transition hover:bg-white/[0.04] hover:text-[var(--text)]"
                  >
                    <MoreHorizontal size={14} />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-full z-20 mt-1 min-w-[150px] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-xl">
                      {menuItems.map((item, idx) => {
                        const key =
                          item.type === "status"
                            ? item.status
                            : item.type === "outcome"
                              ? `${item.outcome}-${idx}`
                              : item.type === "stage_move"
                                ? `stage-move-${idx}`
                                : item.type === "scheduling_link"
                                  ? `scheduling-link-${idx}`
                                  : "interview";
                        const isInterview = item.type === "interview";
                        const isSchedulingLink = item.type === "scheduling_link";
                        const isStageMove = item.type === "stage_move";
                        return (
                          <button
                            key={key}
                            type="button"
                            disabled={
                              isUpdating ||
                              isOutcomeLogging ||
                              stageMoveLoading ||
                              (isInterview && isInterviewRequesting) ||
                              (isSchedulingLink && isSchedulingLinkSending)
                            }
                            onClick={() => {
                              if (item.type === "status") {
                                onStatusChange(pc.id, pc.job_id, item.status);
                                setMenuOpen(false);
                              } else if (item.type === "stage_move") {
                                openStageMovePopover();
                              } else if (item.type === "outcome" && onOutcomeLog) {
                                onOutcomeLog(pc.job_id, pc.candidate_id, item.outcome);
                                setMenuOpen(false);
                              } else if (item.type === "interview") {
                                setMenuOpen(false);
                                openInterviewPopover();
                              } else if (item.type === "scheduling_link" && onSendSchedulingLink) {
                                setMenuOpen(false);
                                void onSendSchedulingLink(pc.job_id, pc.id);
                              }
                            }}
                            className={
                              isInterview || isSchedulingLink
                                ? "flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-[var(--accent)] transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                                : isStageMove
                                  ? "flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-sky-300 transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                                  : `flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium ${item.color} transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50`
                            }
                          >
                            {item.type === "outcome" && item.outcome === "hired" && (
                              <Trophy size={14} className="shrink-0" />
                            )}
                            {item.type === "interview" && (
                              <Calendar size={14} className="shrink-0" />
                            )}
                            {item.type === "scheduling_link" && (
                              <Link2 size={14} className="shrink-0" />
                            )}
                            {item.type === "stage_move" && (
                              <MoreHorizontal size={14} className="shrink-0" />
                            )}
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {interviewPopoverOpen && onRequestInterview && (
                    <div className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl">
                      <p className="mb-2 text-xs font-medium text-[var(--text)]">
                        Request Interview
                      </p>
                      {stagesLoading ? (
                        <div className="flex items-center gap-2 py-2">
                          <Loader2 size={14} className="animate-spin" />
                          <span className="text-xs text-white/60">Loading stages…</span>
                        </div>
                      ) : stages.length > 0 ? (
                        <select
                          aria-label="Interview stage (optional)"
                          value={selectedStageId ?? ""}
                          onChange={(e) =>
                            setSelectedStageId(e.target.value ? e.target.value : undefined)
                          }
                          className="mb-2 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--text)]"
                        >
                          <option value="">Default (first stage)</option>
                          {stages.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.stage_name}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setInterviewPopoverOpen(false)}
                          className="flex-1 rounded-md border border-[var(--border)] px-2 py-1.5 text-xs font-medium text-white/60 transition hover:bg-white/[0.04]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleRequestInterviewSubmit}
                          disabled={isInterviewRequesting}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-2 py-1.5 text-xs font-medium text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isInterviewRequesting ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Calendar size={14} />
                          )}
                          Request
                        </button>
                      </div>
                    </div>
                  )}
                  {stageMovePopoverOpen && onMoveStage && (
                    <div className="absolute right-0 top-full z-20 mt-1 min-w-[220px] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl">
                      <p className="mb-2 text-xs font-medium text-[var(--text)]">Move stage</p>
                      {stagesLoading ? (
                        <div className="flex items-center gap-2 py-2">
                          <Loader2 size={14} className="animate-spin" />
                          <span className="text-xs text-white/60">Loading stages...</span>
                        </div>
                      ) : stages.length > 0 ? (
                        <select
                          aria-label="Move stage target"
                          value={stageMoveSelection}
                          onChange={(e) => setStageMoveSelection(e.target.value)}
                          className="mb-2 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--text)]"
                        >
                          {stages.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.stage_name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="mb-2 text-xs text-white/60">
                          No other stages available for this candidate.
                        </p>
                      )}
                      {stageMoveNotice && (
                        <p className="mb-2 text-xs text-white/60">{stageMoveNotice}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setStageMovePopoverOpen(false)}
                          className="flex-1 rounded-md border border-[var(--border)] px-2 py-1.5 text-xs font-medium text-white/60 transition hover:bg-white/[0.04]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={submitStageMove}
                          disabled={stageMoveLoading || !stageMoveSelection}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-2 py-1.5 text-xs font-medium text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {stageMoveLoading ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            "Move"
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {reasoningOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
          onClick={() => setReasoningOpen(false)}
        >
          <div
            className="max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[var(--text)]">FitScore Reasoning</h3>
                <p className="text-xs text-white/60">
                  {displayName} · {pc.jobTitle}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close score reasoning"
                onClick={() => setReasoningOpen(false)}
                className="rounded-md p-1 text-white/60 hover:bg-white/[0.04] hover:text-[var(--text)]"
              >
                <X size={16} />
              </button>
            </div>

            {pc.oneLineSummary && (
              <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/70 px-3 py-2 text-sm text-white/60">
                {pc.oneLineSummary}
              </div>
            )}

            {(pc.criteriaBreakdown?.length ?? 0) > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                  Criteria Breakdown
                </p>
                {pc.criteriaBreakdown!.map((item, idx) => {
                  const pct = criteriaPercent(item);
                  return (
                    <div
                      key={`${item.criterion_name ?? "criterion"}-${idx}`}
                      className="rounded-lg border border-[var(--border)] p-3"
                    >
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-[var(--text)]">
                          {item.criterion_name ?? "Criterion"}
                        </p>
                        <p className="text-xs text-white/60">
                          Grade {item.grade ?? "E"} · {item.points_earned ?? 0}/{item.weight ?? 0}
                        </p>
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--bg-elevated)]">
                        <div
                          className="h-full rounded-full bg-emerald-400"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {item.evidence_text && (
                        <p className="mt-2 text-xs text-white/60">Evidence: {item.evidence_text}</p>
                      )}
                      {item.reasoning && (
                        <p className="mt-1 text-xs text-white/60">{item.reasoning}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-[var(--border)] p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
                  Strengths
                </p>
                <ul className="mt-2 space-y-1 text-sm text-white/60">
                  {(pc.keyStrengths ?? pc.greenFlags ?? []).slice(0, 8).map((value) => (
                    <li key={`s-${value}`}>+ {value}</li>
                  ))}
                  {(pc.keyStrengths ?? pc.greenFlags ?? []).length === 0 && (
                    <li className="text-white/60">No strengths captured.</li>
                  )}
                </ul>
              </div>
              <div className="rounded-lg border border-[var(--border)] p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">Gaps</p>
                <ul className="mt-2 space-y-1 text-sm text-white/60">
                  {(pc.keyGaps ?? pc.redFlags ?? []).slice(0, 8).map((value) => (
                    <li key={`g-${value}`}>- {value}</li>
                  ))}
                  {(pc.keyGaps ?? pc.redFlags ?? []).length === 0 && (
                    <li className="text-white/60">No gaps captured.</li>
                  )}
                </ul>
              </div>
            </div>

            {(pc.matchedKeywords?.length ?? 0) > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                  Matched Keywords
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {pc.matchedKeywords!.slice(0, 20).map((keyword) => (
                    <span
                      key={keyword}
                      className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-white/60"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                Provenance
              </p>
              <p className="mt-1 break-all text-xs text-white/60">
                {pc.provenanceHash ?? "Not available for this score row."}
              </p>
              {pc.evidenceSnapshot && (
                <p className="mt-1 text-xs text-white/60">
                  Evidence snapshot captured for audit traceability.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
