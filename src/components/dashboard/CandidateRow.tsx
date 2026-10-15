"use client";

import type { Candidate } from "@/types";
import type { CandidateScreeningFlag } from "@/types";
import FitRing from "@/components/ui/FitRing";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/lib/status-tones";
import { screeningFlagLabel } from "@/lib/screening/candidate-flag";
import { scoreToneClasses } from "@/lib/score-tone";

interface CandidateRowProps {
  candidate: Candidate;
  fitScore?: number;
  onClick?: () => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

const SCREENING_FLAG_TONES: Record<CandidateScreeningFlag, StatusTone> = {
  completed: "success",
  in_progress: "info",
  attention: "warning",
  not_started: "neutral",
};

export default function CandidateRow({ candidate, fitScore, onClick }: CandidateRowProps) {
  const displayName = candidate.claimed ? candidate.name : candidate.nameMasked;
  const initials = getInitials(displayName);
  const intent = scoreToneClasses(candidate.intentScore);
  const screeningFlag = candidate.screeningFlag ?? "not_started";

  const Wrapper = onClick ? "button" : "div";
  const wrapperProps = onClick ? { type: "button" as const, onClick } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`card-lifted card-lifted-hover flex w-full flex-wrap items-center gap-3 px-3 py-2.5 text-left ${
        onClick ? "cursor-pointer" : ""
      }`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-muted)] text-xs font-semibold text-[var(--accent)]">
        {initials}
      </div>

      <div className="min-w-0 flex-1">
        {/* Single consistent weight — the old split bolded only the masked
            surname initial (e.g. "S." for "Aarav S."), which read as a bug (Candidates #4). */}
        <p className="truncate text-sm font-medium text-[var(--text)]">{displayName}</p>
        <p className="text-body truncate text-sm text-[var(--text-muted)]">
          {candidate.roleTitle}
          {candidate.currentCompany && ` at ${candidate.currentCompany}`}
        </p>
      </div>

      <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
        {candidate.locationCity && (
          <span className="text-body text-xs text-[var(--text-subtle)]">
            {candidate.locationCity}
          </span>
        )}
        <span
          className={`rounded-full px-2 py-0.5 text-body text-xs font-medium ${intent.bg} ${intent.text}`}
        >
          {candidate.intentScore} intent
        </span>
        {screeningFlag !== "not_started" ? (
          <StatusBadge tone={SCREENING_FLAG_TONES[screeningFlag]} size="sm">
            {screeningFlagLabel(screeningFlag)}
          </StatusBadge>
        ) : null}
        {fitScore !== undefined && <FitRing score={fitScore} size={32} showLabel={false} />}
        <span className="hidden rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-body text-xs text-[var(--text-muted)] sm:inline-flex">
          {candidate.seniorityLevel}
        </span>
        <span className="hidden text-body text-xs text-[var(--text-subtle)] sm:inline">
          {candidate.yearsExperience}yr exp
        </span>
      </div>
    </Wrapper>
  );
}
