"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Loader2,
  Briefcase,
  BarChart3,
  ChevronRight,
  AlertTriangle,
  XCircle,
  MoreHorizontal,
  CheckSquare,
  Square,
  Trash2,
  UserX,
} from "../agency-pipeline-icons";
import {
  AGENCY_STAGES,
  AGENCY_STAGE_MAP,
  DEFAULT_AGENCY_STAGE,
  type AgencyStage,
} from "@/lib/constants/agency-stages";
import type { StatusTone } from "@/lib/status-tones";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FitScoreHoverCard } from "@/components/dashboard/FitScoreHoverCard";

/** Column header badge tones aligned with company pipeline Kanban styling. */
function agencyPipelineColumnTone(stageKey: string): StatusTone {
  switch (stageKey) {
    case "joined":
      return "success";
    case "offered":
      return "info";
    case "interview":
    case "final_round":
      return "warning";
    case "shortlisted":
      return "info";
    default:
      return "neutral";
  }
}

export interface PipelineEntry {
  id: string;
  job_id: string;
  candidate_id: string;
  status: string;
  stage_id: string | null;
  agency_stage: string | null;
  interview_scheduled_at: string | null;
  interview_outcome: string | null;
  recruiter_rating: number | null;
  created_at: string;
  jobTitle: string;
  jobOrganisationId: string | null;
  jobOrganisationName: string | null;
  jobCompensationMin: number | null;
  jobCompensationMax: number | null;
  jobRoleFunction: string | null;
  stageName: string | null;
  overallScore: number | null;
  primaryScore?: number | null;
  shadowScore?: number | null;
  marketScore?: number | null;
  idealMatch?: number | null;
  recruiterSelected?: string | null;
  oneLineSummary?: string | null;
  keyStrengths?: string[] | null;
  keyGaps?: string[] | null;
  confidence?: string | null;
  band?: string | null;
  greenFlags?: string[] | null;
  redFlags?: string[] | null;
  candidates: {
    id: string;
    name: string | null;
    email: string | null;
    skills: string[] | null;
    location: string | null;
    processing_status: string | null;
    experience_years: number | null;
    current_role: string | null;
  } | null;
  approvals: { approver_role: string; decision: string; decided_at: string }[];
}

export function CandidateCard({
  entry,
  onMove,
  moving,
  onScore,
  reprocessing,
  onDrop,
  dropping,
  onDelete,
  deleting,
  onEraseCandidate,
  erasingCandidateId,
  onRefetch,
  onOptimisticScore,
  displayedScoreOverride,
  selected,
  onSelectToggle,
}: {
  entry: PipelineEntry;
  onMove: (pcId: string, jobId: string, newStage: string) => void;
  moving: string | null;
  onScore: (candidateId: string) => void;
  onDrop: (pcId: string, jobId: string) => void;
  dropping: string | null;
  onDelete: (pcId: string, jobId: string) => void;
  deleting: string | null;
  onEraseCandidate?: (candidateId: string) => void;
  erasingCandidateId?: string | null;
  reprocessing: string | null;
  onRefetch?: () => void | Promise<unknown>;
  onOptimisticScore?: (entryId: string, displayedScore: number) => void;
  displayedScoreOverride?: number;
  selected?: boolean;
  onSelectToggle?: (pipelineCandidateId: string) => void;
}) {
  const candidate = entry.candidates;
  const rowHasFitScore = displayedScoreOverride !== undefined || entry.overallScore != null;
  const isPending = candidate?.processing_status === "pending" && !rowHasFitScore;
  const currentStage = AGENCY_STAGE_MAP.get(entry.agency_stage ?? DEFAULT_AGENCY_STAGE);
  const currentIdx = AGENCY_STAGES.findIndex(
    (s) => s.key === (entry.agency_stage ?? DEFAULT_AGENCY_STAGE),
  );
  const nextStage = currentIdx < AGENCY_STAGES.length - 1 ? AGENCY_STAGES[currentIdx + 1] : null;
  const isMoving = moving === entry.id;
  const isDropping = dropping === entry.id;
  const isDeleting = deleting === entry.id;
  const isErasing = erasingCandidateId === entry.candidate_id;
  const isReprocessing = reprocessing === entry.candidate_id;
  const isFinalStage = !nextStage && currentStage?.key === "joined";
  const fitScoreRaw = displayedScoreOverride ?? entry.overallScore;
  const fitScoreDisplay = fitScoreRaw != null ? Math.round(fitScoreRaw) : null;
  const marketScoreDisplay = entry.marketScore != null ? Math.round(entry.marketScore) : null;
  const idealMatchDisplay = entry.idealMatch != null ? Math.round(entry.idealMatch) : null;
  const hasScore = fitScoreDisplay != null;

  // Overflow menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div
      className={`space-y-3 card-lifted p-4 backdrop-blur-md transition hover:border-[var(--accent)]/30 ${isPending ? "ring-1 ring-amber-500/25 bg-amber-500/[0.06]" : ""} ${selected ? "ring-2 ring-[var(--accent)]/40" : ""}`}
    >
      {/* ── Header: Name + Score pill ── */}
      <div className="flex items-center justify-between gap-2">
        {onSelectToggle ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelectToggle(entry.id);
            }}
            className="shrink-0 text-white/60 hover:text-[var(--text)]"
            aria-label={selected ? "Deselect candidate" : "Select candidate"}
          >
            {selected ? (
              <CheckSquare size={18} className="text-[var(--accent)]" />
            ) : (
              <Square size={18} />
            )}
          </button>
        ) : null}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link
            href={`/agency/candidates/${entry.candidate_id}`}
            className="heading-card min-w-0 truncate text-base font-semibold text-[var(--text)] hover:text-[var(--accent)] hover:underline"
          >
            {candidate?.name ?? "Unknown"}
          </Link>
          {hasScore &&
          entry.shadowScore != null &&
          Math.round(entry.shadowScore) !== fitScoreDisplay ? (
            <span
              title="Shadow score (blended signal)"
              className="shrink-0 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-400 tabular-nums"
            >
              S:{entry.shadowScore}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {!hasScore && isPending ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
              <AlertTriangle size={14} />
              Pending
            </span>
          ) : null}
          {!hasScore && !isPending ? (
            <span className="rounded-full bg-zinc-500/15 px-2 py-0.5 text-xs text-zinc-400">
              --
            </span>
          ) : null}

          {/* Overflow menu trigger */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded p-0.5 text-white/60 transition hover:bg-white/[0.04] hover:text-white/60"
              aria-label="More actions"
            >
              <MoreHorizontal size={14} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 shadow-xl">
                {/* Move to stage options */}
                {AGENCY_STAGES.filter(
                  (s) => s.key !== (entry.agency_stage ?? DEFAULT_AGENCY_STAGE),
                ).map((stage) => (
                  <button
                    key={stage.key}
                    type="button"
                    disabled={isMoving}
                    onClick={() => {
                      onMove(entry.id, entry.job_id, stage.key);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/[0.04] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronRight size={14} className="shrink-0" />
                    {stage.label}
                  </button>
                ))}

                {/* Divider */}
                <div className="my-1 border-t border-[var(--border)]" />

                {/* Reject and notify */}
                <button
                  type="button"
                  disabled={isDropping || isDeleting || isErasing}
                  onClick={() => {
                    onDrop(entry.id, entry.job_id);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDropping ? (
                    <Loader2 size={14} className="shrink-0 animate-spin" />
                  ) : (
                    <XCircle size={14} className="shrink-0" />
                  )}
                  Drop (notify candidate)
                </button>

                {/* Remove row — no email/WhatsApp */}
                <button
                  type="button"
                  disabled={isDropping || isDeleting || isErasing}
                  onClick={() => {
                    onDelete(entry.id, entry.job_id);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-400/90 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDeleting ? (
                    <Loader2 size={14} className="shrink-0 animate-spin" />
                  ) : (
                    <Trash2 size={14} className="shrink-0" />
                  )}
                  Delete (no message)
                </button>

                {onEraseCandidate ? (
                  <>
                    <div className="my-1 border-t border-[var(--border)]" />
                    <button
                      type="button"
                      disabled={isDropping || isDeleting || isErasing}
                      onClick={() => {
                        onEraseCandidate(entry.candidate_id);
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-amber-400 transition hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isErasing ? (
                        <Loader2 size={14} className="shrink-0 animate-spin" />
                      ) : (
                        <UserX size={14} className="shrink-0" />
                      )}
                      Erase candidate data (GDPR)
                    </button>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Role + client (unified board shows all jobs) ── */}
      <div className="mt-1 space-y-0.5 text-xs text-[var(--text-muted)]">
        <div className="flex items-center gap-1">
          <Briefcase size={13} className="shrink-0 opacity-80" />
          <Link
            href={`/agency/jobs/${entry.job_id}`}
            className="min-w-0 truncate text-[var(--accent)] hover:underline"
          >
            {entry.jobTitle}
          </Link>
        </div>
        {entry.jobOrganisationName ? (
          <p className="truncate pl-[1.125rem] text-[10px] text-white/50">
            {entry.jobOrganisationName}
          </p>
        ) : null}
      </div>

      {hasScore ? (
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-3">
          <div>
            <div className="group relative">
              <p className="text-lg font-semibold text-emerald-400 tabular-nums">
                {fitScoreDisplay ?? "--"}
              </p>
              <FitScoreHoverCard
                band={entry.band ?? null}
                confidence={entry.confidence ?? null}
                strengths={entry.keyStrengths ?? entry.greenFlags ?? null}
                gaps={entry.keyGaps ?? entry.redFlags ?? null}
              />
            </div>
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Fit</p>
            <div className="mt-1 h-1.5 rounded-full bg-emerald-500/20">
              <div
                className="h-full rounded-full bg-emerald-400"
                style={{ width: `${fitScoreDisplay ?? 0}%` }}
              />
            </div>
          </div>
          <div>
            <p className="text-lg font-semibold text-sky-300 tabular-nums">
              {marketScoreDisplay ?? "--"}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Market</p>
            <div className="mt-1 h-1.5 rounded-full bg-sky-500/20">
              <div
                className="h-full rounded-full bg-sky-300"
                style={{ width: `${marketScoreDisplay ?? 0}%` }}
              />
            </div>
          </div>
          <div>
            <p className="text-lg font-semibold text-violet-300 tabular-nums">
              {idealMatchDisplay ?? "--"}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Ideal</p>
            <div className="mt-1 h-1.5 rounded-full bg-violet-500/20">
              <div
                className="h-full rounded-full bg-violet-300"
                style={{ width: `${idealMatchDisplay ?? 0}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* ── One scannable line: AI summary only (band, flags, strengths → detail page) ── */}
      {entry.oneLineSummary ? (
        <p className="mt-1.5 text-[11px] leading-snug text-[var(--text-subtle)] line-clamp-1">
          {entry.oneLineSummary}
        </p>
      ) : candidate?.experience_years != null ? (
        <p className="mt-1.5 text-[11px] text-[var(--text-subtle)]">
          {candidate.experience_years} years experience
        </p>
      ) : null}

      {/* ── Footer: Single primary action ── */}
      <div className="mt-1.5">
        {isPending ? (
          <button
            type="button"
            disabled={isReprocessing}
            onClick={() => onScore(entry.candidate_id)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-400 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isReprocessing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Scoring...
              </>
            ) : (
              <>
                <BarChart3 size={14} />
                Score
              </>
            )}
          </button>
        ) : isFinalStage ? (
          <div className="rounded-lg bg-green-500/10 px-2 py-1 text-center text-xs font-semibold text-green-400">
            Placement complete
          </div>
        ) : hasScore ? (
          <Link
            href={`/agency/candidates/${entry.candidate_id}`}
            className="flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-muted)] transition hover:text-[var(--accent)]"
          >
            View details
            <ChevronRight size={14} />
          </Link>
        ) : (
          <button
            type="button"
            disabled={isReprocessing}
            onClick={() => onScore(entry.candidate_id)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-400 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isReprocessing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Scoring...
              </>
            ) : (
              <>
                <BarChart3 size={14} />
                Score
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export function KanbanColumn({
  stage,
  entries,
  onMove,
  moving,
  onScore,
  reprocessing,
  onDrop,
  dropping,
  onDelete,
  deleting,
  onEraseCandidate,
  erasingCandidateId,
  onRefetch,
  onOptimisticScore,
  optimisticScoreByEntryId,
  selectedPcIds,
  onSelectToggle,
}: {
  stage: AgencyStage;
  entries: PipelineEntry[];
  onMove: (pcId: string, jobId: string, newStage: string) => void;
  moving: string | null;
  onScore: (candidateId: string) => void;
  reprocessing: string | null;
  onDrop: (pcId: string, jobId: string) => void;
  dropping: string | null;
  onDelete: (pcId: string, jobId: string) => void;
  deleting: string | null;
  onEraseCandidate?: (candidateId: string) => void;
  erasingCandidateId?: string | null;
  onRefetch?: () => void | Promise<unknown>;
  onOptimisticScore?: (entryId: string, displayedScore: number) => void;
  optimisticScoreByEntryId?: Record<string, number>;
  selectedPcIds?: Set<string>;
  onSelectToggle?: (pipelineCandidateId: string) => void;
}) {
  return (
    <div className="flex h-[70vh] w-[320px] shrink-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)]/40 backdrop-blur-sm">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${stage.bg} ${stage.color}`}
              aria-hidden
            />
            <h3 className="heading-card truncate text-sm text-[var(--text)]">{stage.label}</h3>
          </div>
          <span className="flex h-6 min-w-6 shrink-0 items-center justify-center">
            <StatusBadge tone={agencyPipelineColumnTone(stage.key)} size="sm">
              {entries.length}
            </StatusBadge>
          </span>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {entries.length === 0 ? (
          <p className="py-4 text-center text-xs text-[var(--text-subtle)]">No candidates</p>
        ) : (
          entries.map((e) => (
            <CandidateCard
              key={e.id}
              entry={e}
              onMove={onMove}
              moving={moving}
              onScore={onScore}
              reprocessing={reprocessing}
              onDrop={onDrop}
              dropping={dropping}
              onDelete={onDelete}
              deleting={deleting}
              onEraseCandidate={onEraseCandidate}
              erasingCandidateId={erasingCandidateId}
              onRefetch={onRefetch}
              onOptimisticScore={onOptimisticScore}
              displayedScoreOverride={optimisticScoreByEntryId?.[e.id]}
              selected={selectedPcIds?.has(e.id)}
              onSelectToggle={onSelectToggle}
            />
          ))
        )}
      </div>
    </div>
  );
}
