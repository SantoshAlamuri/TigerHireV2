"use client";

import { useState } from "react";
import Link from "next/link";
import type { FitScore } from "@/types";
import { getFitScoreBgColor, getFitScoreColor, getFitScoreGlow } from "@/types";
import { Archive, Lock, UserPlus, View, AlertCircle, Loader2 } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { FitScoreDimensionBars } from "./FitScoreDimensionBars";
import { FitScoreFeedbackPrompt } from "./FitScoreFeedbackPrompt";
import { FitScoreTripleMetrics } from "./FitScoreTripleMetrics";
import { displayedFitScore } from "./fit-score-display-helpers";
import {
  shortenWhyVerdictForCustomer,
  whyVerdictIsRedundantWithGaps,
} from "./FitScoreReasoningPanel";

interface FitScoreCardProps {
  score: FitScore;
  unlocked?: boolean;
  onUnlock?: () => void;
  onShortlist?: () => void;
  onArchive?: () => void;
  onView?: () => void;
  /** When set with compact, the whole row is a link to this href (e.g. candidate page). */
  viewHref?: string;
  compact?: boolean;
  /** When set, enables "Alternative: X" and "Use this score" for dual score; called after selection. */
  onRefetch?: () => void | Promise<unknown>;
  /** Hide avatar + candidate name when the parent page already shows profile (e.g. agency candidate). */
  hideCandidateHeader?: boolean;
  /** Recruit-only: enable post-interview FitScore feedback prompt in full mode. */
  showFeedbackPrompt?: boolean;
  /** Recruit-only eligibility gate (Interviewed stage or beyond). */
  feedbackEligible?: boolean;
}

function cardInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const a = parts[0][0] ?? "";
  const b = parts[parts.length - 1][0] ?? "";
  return `${a}${b}`.toUpperCase();
}

function marketHeadline(score: FitScore): { value: string; sub?: string } {
  if (score.marketLabel) {
    const shortened =
      score.marketLabel.split(" — ")[0]?.split(" - ")[0]?.trim() ?? score.marketLabel;
    return { value: shortened };
  }
  if (score.marketPercentile != null && Number.isFinite(score.marketPercentile)) {
    const top = Math.max(0, Math.min(100, 100 - Math.round(score.marketPercentile)));
    return { value: `Top ${top}%` };
  }
  return { value: "—", sub: "Market data building..." };
}

/**
 * The badge must describe how the score was actually produced. It previously
 * discarded its input and rendered "AI Scored" unconditionally — including for
 * keyword-fallback and deferred scores, asserting confidence the system did not
 * have.
 */
function ScoringVersionBadge({
  version,
  scoringStatus,
  extractionFallback,
}: {
  version?: number;
  scoringStatus?: string | null;
  extractionFallback?: boolean;
}) {
  const degraded =
    extractionFallback === true ||
    (scoringStatus != null && scoringStatus !== "scored" && scoringStatus !== "completed");

  const label =
    extractionFallback === true ? "Keyword fallback" : degraded ? "Partial score" : "AI Scored";
  const title =
    extractionFallback === true
      ? "Scored by deterministic keyword matching, not AI reasoning — treat as indicative only."
      : degraded
        ? `Scoring did not complete normally (${scoringStatus}). Rescore for a full result.`
        : `Score computed by TigerHire AI${version ? ` (v${version})` : ""}`;

  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${
        degraded
          ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
          : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]"
      }`}
      title={title}
    >
      {label}
    </span>
  );
}

export default function FitScoreCard({
  score,
  unlocked = false,
  onUnlock,
  onShortlist,
  onArchive,
  onView,
  viewHref,
  compact = false,
  onRefetch,
  hideCandidateHeader = false,
  showFeedbackPrompt = false,
  feedbackEligible = false,
}: FitScoreCardProps) {
  const displayName = unlocked ? score.candidateName : score.candidateNameMasked;
  const headlineScore = displayedFitScore(score);
  const scoreColor = getFitScoreColor(headlineScore);
  const scoreBg = getFitScoreBgColor(headlineScore);
  const scoreGlow = getFitScoreGlow(headlineScore);

  const ghostLabel = score.candidateGhostRiskLabel;
  const ghostColor =
    ghostLabel === "LOW"
      ? "bg-emerald-500/15 text-emerald-400"
      : ghostLabel === "MEDIUM"
        ? "bg-amber-500/15 text-amber-400"
        : ghostLabel === "HIGH"
          ? "bg-red-500/15 text-red-400"
          : "";

  const [blendLoading, setBlendLoading] = useState(false);
  const [blendError, setBlendError] = useState<string | null>(null);
  const usingShadow = score.recruiterSelected === "shadow";
  /**
   * The alternate row must never show the currently-selected score: when shadow is selected the
   * alternate is the primary blend (hidden when unknown), otherwise it is the shadow blend.
   */
  const otherScore = usingShadow ? (score.primaryScore ?? null) : (score.shadowScore ?? null);
  const showShadowRow =
    onRefetch &&
    score.shadowScore != null &&
    (score.primaryScore != null || score.shadowScore !== score.overallScore) &&
    otherScore != null;

  async function handleSelectBlend(selection: "primary" | "shadow") {
    if (!onRefetch || !score.jobPostingId || !score.candidateId) return;
    setBlendLoading(true);
    setBlendError(null);
    try {
      const res = await fetch("/api/fitscore/select-blend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: score.jobPostingId,
          candidate_id: score.candidateId,
          selection,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message = typeof body?.error === "string" ? body.error : "Failed to save selection";
        setBlendError(message);
        throw new Error(message);
      }
      await onRefetch();
    } finally {
      setBlendLoading(false);
    }
  }

  if (compact) {
    const compactContent = (
      <>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="heading-card truncate text-sm text-[var(--text)]">{displayName}</p>
            <p className="text-body text-sm text-[var(--text-muted)]">{score.jobTitle}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${scoreBg} ${scoreColor} ${scoreGlow}`}
          >
            {headlineScore}/100
          </span>
          <ScoringVersionBadge
            version={score.scoringVersion}
            scoringStatus={score.scoringStatus}
            extractionFallback={score.extractionFallback ?? undefined}
          />
          {score.candidateTrustScore != null && (
            <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
              Trust {score.candidateTrustScore}
            </span>
          )}
          {ghostColor && (
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ghostColor}`}>
              Reliability Signal (beta): {ghostLabel}
            </span>
          )}
          {(score.candidateVouches?.length ?? 0) > 0 && (
            <span className="shrink-0 text-xs text-[var(--text-subtle)]">
              {score.candidateVouches!.length} vouch(es)
            </span>
          )}
          {score.humanReviewRequired && (
            <span
              className="shrink-0 flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
              title={score.humanReviewReason ?? undefined}
            >
              <AlertCircle size={10} />
              Review
            </span>
          )}
        </div>
        <span className="shrink-0 flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-body text-sm font-semibold text-[var(--text)] transition group-hover:bg-[var(--surface)]">
          <View size={14} />
          View score
        </span>
      </>
    );
    const className =
      "flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 px-4 py-3 backdrop-blur-sm transition hover:border-[var(--accent)]/40 hover:bg-[var(--surface)]/80";
    const shadowRow = showShadowRow && (
      <div
        className="flex flex-wrap items-center justify-end gap-2 pl-4 pr-4 pb-2 text-xs"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <span
          className="text-[var(--text-muted)]"
          title="A second scoring blend that weighs criteria differently. Compare both to calibrate."
        >
          Alternate score: <strong className="text-[var(--text)]">{otherScore}</strong>
        </span>
        {blendError && (
          <span className="text-red-500" role="alert">
            {blendError}
          </span>
        )}
        {blendLoading ? (
          <Loader2 size={12} className="animate-spin text-[var(--text-muted)]" />
        ) : usingShadow ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSelectBlend("primary");
            }}
            className="rounded border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]"
          >
            Use original score
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSelectBlend("shadow");
            }}
            className="rounded border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--accent)] transition hover:bg-[var(--bg-elevated)]"
          >
            Use this score
          </button>
        )}
      </div>
    );
    if (viewHref) {
      return (
        <div className="space-y-0">
          <Link href={viewHref} className={`group block ${className}`}>
            {compactContent}
          </Link>
          {shadowRow}
        </div>
      );
    }
    return (
      <div className="space-y-0">
        <div
          role="button"
          tabIndex={0}
          className={className}
          onClick={onView}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onView?.();
            }
          }}
        >
          {compactContent}
        </div>
        {shadowRow}
      </div>
    );
  }

  const { value: marketValue, sub: marketSub } = marketHeadline(score);
  const idealDisplay =
    score.idealMatchPct != null && score.idealMatchPct > 0 ? `${score.idealMatchPct}%` : "—";
  const idealGaps = (score.idealGaps ?? []).filter((gap) => typeof gap === "string" && gap.trim());
  const allMissingMustHaves = [
    ...(score.missingMustHaves ?? []),
    ...idealGaps.filter((gap) => !(score.missingMustHaves ?? []).includes(gap)),
  ];
  const gapDerivedInterviewQuestions = idealGaps.map(
    (gap) => `Tell me about your experience with ${gap}.`,
  );
  const allInterviewQuestions = [
    ...gapDerivedInterviewQuestions,
    ...(score.interviewAngles ?? []),
  ].filter((question, idx, arr) => Boolean(question?.trim()) && arr.indexOf(question) === idx);
  const roleLine = score.candidateCurrentRole?.trim() || `Open role · ${score.jobTitle}`;
  const verdictStripBadge = score.verdict?.trim() || score.band?.trim() || score.rating || null;
  const verdictStripText =
    score.verdictAction?.trim() ||
    score.oneLineSummary?.trim() ||
    score.holisticRationale?.trim() ||
    null;
  const showVerdictStrip = Boolean(verdictStripText);
  const whyPrimaryRaw =
    score.holisticRationale?.trim() ||
    score.oneLineSummary?.trim() ||
    score.aiSummary?.trim() ||
    "";
  const gapItemsForWhy = [
    ...(score.redFlags ?? []),
    ...(score.keyGaps ?? []),
    ...(score.idealGaps ?? []),
  ];
  const whyPrimaryCandidate = shortenWhyVerdictForCustomer(whyPrimaryRaw);
  const whyPrimary =
    whyPrimaryCandidate && !whyVerdictIsRedundantWithGaps(whyPrimaryCandidate, gapItemsForWhy)
      ? whyPrimaryCandidate
      : "";
  const whyExtra =
    whyPrimary &&
    score.aiSummary?.trim() &&
    score.aiSummary.trim() !== whyPrimary &&
    (score.holisticRationale?.trim() || score.oneLineSummary?.trim())
      ? score.aiSummary.trim()
      : "";
  const showWhyBlock =
    Boolean(whyPrimary) && whyPrimary.trim() !== (verdictStripText?.trim() ?? "");
  const showKeyStrengthsBox =
    (score.keyStrengths?.length ?? 0) > 0 && score.greenFlags.length === 0;
  const showKeyGapsBox = (score.keyGaps?.length ?? 0) > 0 && score.redFlags.length === 0;
  const deltaBaseline = score.primaryScore ?? score.overallScore;
  const shadowDelta =
    score.shadowScore != null && deltaBaseline != null && Number.isFinite(deltaBaseline)
      ? score.shadowScore - deltaBaseline
      : null;
  const showShadowDeltaSignal =
    (score.scoringVersion === 2 || score.shadowScore != null) &&
    shadowDelta != null &&
    Math.abs(shadowDelta) >= 8;
  const shadowDeltaDirection =
    shadowDelta != null && shadowDelta >= 8
      ? "up"
      : shadowDelta != null && shadowDelta <= -8
        ? "down"
        : null;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-6 backdrop-blur-sm md:p-8">
      {/* Header — full candidate block, or job-only when parent already shows profile */}
      {hideCandidateHeader ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-body text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Scored for
            </p>
            <h3 className="heading-card mt-0.5 text-lg text-[var(--text)]">{score.jobTitle}</h3>
            {score.companyName ? (
              <p className="text-body mt-0.5 truncate text-sm text-[var(--text-muted)]">
                {score.companyName}
              </p>
            ) : null}
          </div>
          {score.shadowScore != null && score.shadowScore > 0 ? (
            <span
              className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--text)]"
              title="Shadow score (40% signal / 60% grade blend). Compare with main score."
            >
              S:{score.shadowScore}
            </span>
          ) : null}
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-sm font-bold text-amber-400"
            aria-hidden
          >
            {cardInitials(displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-body text-sm text-[var(--text-muted)]">{roleLine}</p>
            <h3 className="heading-card mt-0.5 text-lg text-[var(--text)]">{displayName}</h3>
            <p className="text-body mt-0.5 truncate text-sm text-[var(--text-muted)]">
              {score.jobTitle}
            </p>
          </div>
          {score.shadowScore != null && score.shadowScore > 0 ? (
            <span
              className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--text)]"
              title="Shadow score (40% signal / 60% grade blend). Compare with main score."
            >
              S:{score.shadowScore}
            </span>
          ) : null}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${scoreBg} ${scoreColor} ${scoreGlow}`}
        >
          {score.band ?? score.rating}
        </span>
        <ScoringVersionBadge
          version={score.scoringVersion}
          scoringStatus={score.scoringStatus}
          extractionFallback={score.extractionFallback ?? undefined}
        />
        {score.confidence && (
          <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-0.5 text-xs text-[var(--text-muted)]">
            Confidence: {score.confidence}
          </span>
        )}
        {score.humanReviewRequired && (
          <span
            className="flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
            title={score.humanReviewReason ?? undefined}
          >
            <AlertCircle size={12} />
            Human review recommended
          </span>
        )}
        {score.candidateAuthenticitySignal && (
          <span
            className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              score.candidateAuthenticitySignal === "likely_authentic"
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : score.candidateAuthenticitySignal === "review_carefully"
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-400"
            }`}
            title={
              score.candidateAuthenticityReasons && score.candidateAuthenticityReasons.length > 0
                ? score.candidateAuthenticityReasons.join(", ")
                : undefined
            }
          >
            <AlertCircle size={12} />
            {score.candidateAuthenticitySignal === "likely_authentic"
              ? "Authenticity check: likely original"
              : score.candidateAuthenticitySignal === "review_carefully"
                ? "Authenticity check: review carefully"
                : "Authenticity check: likely AI-generated"}
          </span>
        )}
      </div>

      <FitScoreTripleMetrics score={score} className="mt-5" />

      {showShadowDeltaSignal && shadowDeltaDirection === "up" ? (
        <div
          className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-300"
          title="Shadow score blends FitScore, market benchmark, and ideal-profile alignment to add context to the main score."
        >
          Undervalued — strong context fit, weak CV presentation
        </div>
      ) : null}

      {showShadowDeltaSignal && shadowDeltaDirection === "down" ? (
        <div
          className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-sm text-amber-300"
          title="Shadow score blends FitScore, market benchmark, and ideal-profile alignment to add context to the main score."
        >
          Overvalued — weaker market and ideal fit than score suggests
        </div>
      ) : null}

      {showVerdictStrip ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5">
          {verdictStripBadge ? (
            <span className="shrink-0 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-300">
              {verdictStripBadge}
            </span>
          ) : null}
          <p className="min-w-0 flex-1 text-sm leading-snug text-[var(--text-muted)]">
            {verdictStripText}
          </p>
        </div>
      ) : null}

      {showShadowRow && (
        <div
          className="mt-3 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/80 px-4 py-2 text-xs"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <span
            className="text-[var(--text-muted)]"
            title="A second scoring blend that weighs criteria differently. Compare both to calibrate."
          >
            Alternate score: <strong className="text-[var(--text)]">{otherScore}</strong>
          </span>
          {blendError && (
            <span className="text-red-500" role="alert">
              {blendError}
            </span>
          )}
          {blendLoading ? (
            <Loader2 size={12} className="animate-spin text-[var(--text-muted)]" />
          ) : usingShadow ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSelectBlend("primary");
              }}
              className="rounded border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]"
            >
              Use original score
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSelectBlend("shadow");
              }}
              className="rounded border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--accent)] transition hover:bg-[var(--bg-elevated)]"
            >
              Use this score
            </button>
          )}
        </div>
      )}

      <FitScoreDimensionBars score={score} className="mt-6" />

      {showKeyStrengthsBox ? (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/80 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Key strengths
          </p>
          <ul className="mt-1.5 list-inside list-disc space-y-1.5 text-body text-sm text-[var(--text-muted)]">
            {score.keyStrengths!.slice(0, 5).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {showKeyGapsBox ? (
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/80 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Key gaps
          </p>
          <ul className="mt-1.5 list-inside list-disc space-y-1.5 text-body text-sm text-[var(--text-muted)]">
            {score.keyGaps!.slice(0, 5).map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {(score.candidateTrustScore != null ||
        ghostLabel ||
        (score.candidateVouches?.length ?? 0) > 0 ||
        (score.candidateVerificationClaims?.length ?? 0) > 0) && (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
          {score.candidateTrustScore != null && (
            <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-0.5 text-xs text-[var(--text-muted)]">
              Trust {score.candidateTrustScore}
            </span>
          )}
          {ghostColor && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ghostColor}`}>
              Reliability Signal (beta): {ghostLabel}
            </span>
          )}
          {(score.candidateVouches?.length ?? 0) > 0 && (
            <div className="w-full">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                Vouched by
              </p>
              <ul className="mt-1 space-y-1.5 text-body text-sm text-[var(--text-muted)]">
                {score.candidateVouches!.slice(0, 2).map((v, i) => (
                  <li key={i}>
                    {v.voucher_name ?? "Someone"} · {v.relationship_type ?? ""}
                    {v.standout_sentence ? ` — "${String(v.standout_sentence).slice(0, 60)}…"` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(score.candidateVerificationClaims?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {score.candidateVerificationClaims!.map((c, i) => (
                <span
                  key={i}
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    c.status === "confirmed"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : c.status === "flagged"
                        ? "bg-amber-500/15 text-amber-400"
                        : "bg-[var(--bg-elevated)] text-[var(--text-muted)]"
                  }`}
                >
                  {c.status === "confirmed" ? "✓" : c.status === "flagged" ? "⚠" : "○"}{" "}
                  {c.claim_type ?? "claim"}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Green flags
          </p>
          {score.greenFlags.length > 0 ? (
            <ul className="mt-2 space-y-1.5 text-body text-sm text-[var(--text-muted)]">
              {score.greenFlags.map((flag, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-emerald-400">&#10003;</span>
                  {flag}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-body text-sm text-[var(--text-muted)] italic">
              No strengths identified
            </p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">
            Verify with candidate
          </p>
          {score.amberFlags.length > 0 ? (
            <>
              <p className="mt-1 text-xs leading-snug text-[var(--text-muted)]">
                Inferred from the CV, not verified — confirm before weighing these.
              </p>
              <ul className="mt-2 space-y-1.5 text-body text-sm text-[var(--text-muted)]">
                {score.amberFlags.map((flag, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 text-amber-400">&#9888;</span>
                    {flag}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-body text-sm text-[var(--text-muted)] italic">
              No minor concerns
            </p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-red-400">Red flags</p>
          {allMissingMustHaves.length > 0 ? (
            <>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-red-500">
                Missing must-haves
              </p>
              <ul className="mt-1 space-y-1.5 text-body text-sm text-[var(--text-muted)]">
                {allMissingMustHaves.map((skill, i) => (
                  <li key={`m-${i}`} className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 text-red-500">&#10007;</span>
                    <span>{skill}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {score.redFlags.length > 0 ? (
            <ul className="mt-2 space-y-1.5 text-body text-sm text-[var(--text-muted)]">
              {score.redFlags.map((flag, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-red-400">&#10007;</span>
                  {flag}
                </li>
              ))}
            </ul>
          ) : !allMissingMustHaves.length ? (
            <p className="mt-2 text-body text-sm text-[var(--text-muted)] italic">
              No significant gaps
            </p>
          ) : null}
        </div>
      </div>

      {(() => {
        const hasAnyFlags =
          (score.greenFlags?.length ?? 0) > 0 ||
          (score.amberFlags?.length ?? 0) > 0 ||
          (score.redFlags?.length ?? 0) > 0;
        const hasBreakdown = (score.criteriaBreakdown?.length ?? 0) > 0;
        const hasKeyDetails =
          (score.keyStrengths?.length ?? 0) > 0 || (score.keyGaps?.length ?? 0) > 0;
        const isLegacyScore =
          score.overallScore != null &&
          !hasBreakdown &&
          !hasKeyDetails &&
          !hasAnyFlags &&
          score.jobPostingId;
        if (!isLegacyScore) return null;
        return (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-body text-sm text-[var(--text-muted)]">
              This score was computed with an older version. Re-run scoring from the job page to see
              band, criteria breakdown, and green/amber/red flags.
            </p>
            <Link
              href={`/recruit/jobs/${score.jobPostingId}`}
              className="mt-2 inline-flex text-sm font-medium text-[var(--accent)] hover:underline"
            >
              Go to job → Recompute Scores
            </Link>
          </div>
        );
      })()}

      {showWhyBlock ? (
        <div className="mt-6 border-l-4 border-amber-500/60 pl-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-500">
            Why this verdict
          </p>
          <p className="mt-2 whitespace-pre-wrap text-body text-sm leading-relaxed text-[var(--text-muted)]">
            {whyPrimary}
          </p>
          {whyExtra ? (
            <p className="mt-3 text-body text-sm italic text-[var(--text-subtle)]">
              &ldquo;{whyExtra}&rdquo;
            </p>
          ) : null}
        </div>
      ) : null}

      {allInterviewQuestions.length > 0 && (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Interview questions
          </p>
          <ul className="mt-1.5 space-y-1.5 text-body text-sm text-[var(--text)]">
            {allInterviewQuestions.map((question, idx) => (
              <li key={`${idx}-${question}`} className="flex items-start gap-2">
                <span className="mt-0.5 text-[var(--text-subtle)]">&#8226;</span>
                <span>{question}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        {!unlocked && onUnlock && (
          <button
            type="button"
            onClick={onUnlock}
            className="flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
          >
            <Lock size={16} />
            Unlock Contact
          </button>
        )}
        {onShortlist && (
          <button
            type="button"
            onClick={onShortlist}
            className="flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface)]"
          >
            <UserPlus size={16} />
            Add to Shortlist
          </button>
        )}
        {onArchive && (
          <button
            type="button"
            onClick={onArchive}
            className="flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-muted)] transition hover:bg-[var(--surface)]"
          >
            <Archive size={16} />
            Archive
          </button>
        )}
      </div>

      {showFeedbackPrompt &&
      feedbackEligible &&
      score.jobPostingId &&
      score.candidateId &&
      score.id ? (
        <FitScoreFeedbackPrompt
          jobId={score.jobPostingId}
          candidateId={score.candidateId}
          fitScoreId={score.id}
          enabled
        />
      ) : null}
    </div>
  );
}
