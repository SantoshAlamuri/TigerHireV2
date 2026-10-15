"use client";

import { useState } from "react";
import { FitScoreDimensionBars } from "./FitScoreDimensionBars";
import { VerdictMoatPanel } from "./CandidateMoatSignals";
import type { FitScoreReasoningPanelProps } from "./fit-score-reasoning/types";
import { useFitScoreReasoning } from "./fit-score-reasoning/use-fit-score-reasoning";
import { CompactRow } from "./fit-score-reasoning/CompactRow";
import { VerdictHero } from "./fit-score-reasoning/VerdictHero";
import { VerifyWithCandidate } from "./fit-score-reasoning/VerifyWithCandidate";
import { InsightStrip } from "./fit-score-reasoning/InsightStrip";
import { AttributionPanel } from "./fit-score-reasoning/AttributionPanel";
import { FlagColumns } from "./fit-score-reasoning/FlagColumns";
import { CriterionEvidence } from "./fit-score-reasoning/CriterionEvidence";
import { WhyVerdictEvidence } from "./fit-score-reasoning/WhyVerdictEvidence";
import { DecisionTrace } from "./fit-score-reasoning/DecisionTrace";
import { ScoreCalculation } from "./fit-score-reasoning/ScoreCalculation";
import { RubricModal } from "./fit-score-reasoning/RubricModal";

export type { FitScoreReasoningPanelProps } from "./fit-score-reasoning/types";
export {
  linesAreNearDuplicateFlagLines,
  dedupeNearDuplicateFlagLines,
  insightDuplicatesWhyVerdictBody,
  shortenWhyVerdictForCustomer,
  whyVerdictIsRedundantWithGaps,
} from "./fit-score-reasoning/helpers";

export function FitScoreReasoningPanel(props: FitScoreReasoningPanelProps) {
  const {
    score,
    showSuperAdminDiagnostics = false,
    compact = false,
    compactHref,
    compactOnNavigate,
    moatReferrer,
    readiness = null,
    hideHero = false,
  } = props;
  const [rubricOpen, setRubricOpen] = useState(false);
  const d = useFitScoreReasoning(props);

  if (score.scoringStatus === "deferred") {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
        <p className="text-sm font-semibold text-amber-300">Scoring queued - checking back...</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          We are retrying this score after a temporary model availability issue.
        </p>
      </div>
    );
  }

  if (compact) {
    return (
      <CompactRow
        score={score}
        displayName={d.displayName}
        marketValue={d.marketValue}
        idealDisplay={d.idealDisplay}
        compactHref={compactHref}
        compactOnNavigate={compactOnNavigate}
      />
    );
  }

  return (
    <>
      <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] ring-1 ring-white/[0.03] sm:p-6">
        {d.parseWarning && showSuperAdminDiagnostics ? (
          <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-xs leading-snug text-amber-200">
            CV may have parsing issues - review manually.
          </div>
        ) : null}

        {hideHero ? null : (
          <VerdictHero
            score={score}
            primaryVerdictLabel={d.primaryVerdictLabel}
            verdictActionChip={d.verdictActionChip}
            modelFootnote={d.modelFootnote}
            sessionLabel={d.sessionLabel}
            marketValue={d.marketValue}
            marketSub={d.marketSub}
            idealDisplay={d.idealDisplay}
            roleLine={d.roleLine}
            readiness={readiness}
          />
        )}

        {/* Triage row above already carries ambers/greens for the primary score —
            suppress the panel's copies when the Decision Strip owns them (hideHero). */}
        {!hideHero && d.amberItems.length > 0 ? <VerifyWithCandidate items={d.amberItems} /> : null}

        {d.insightBadge || d.insightBody ? (
          <InsightStrip insightBadge={d.insightBadge} insightBody={d.insightBody} />
        ) : null}

        <FitScoreDimensionBars
          score={score}
          sectionTitle="Weighted criteria"
          hideLogistics={hideHero}
        />

        <VerdictMoatPanel
          vouches={score.candidateVouches}
          referrerName={moatReferrer?.referrerName}
          referrerOrgVerified={moatReferrer?.referrerOrgVerified}
          referrerVerifiedOrgName={moatReferrer?.referrerVerifiedOrgName}
          parentReferrerName={moatReferrer?.parentReferrerName}
          ghostLabel={score.candidateGhostRiskLabel}
          authenticitySignal={score.candidateAuthenticitySignal}
          authenticityReasons={score.candidateAuthenticityReasons}
        />

        {showSuperAdminDiagnostics && (d.hasLegacyAttribution || d.hasBlendAttribution) ? (
          <AttributionPanel
            score={score}
            hasLegacyAttribution={d.hasLegacyAttribution}
            signal={d.signal}
            rubric={d.rubric}
            signalPct={d.signalPct}
            rubricPct={d.rubricPct}
          />
        ) : null}

        {hideHero ? null : <FlagColumns strengthItems={d.strengthItems} gapItems={d.gapItems} />}

        {d.evidenceByCriterion.length > 0 ? (
          <CriterionEvidence items={d.evidenceByCriterion} />
        ) : null}

        {(
          hideHero
            ? d.verdictQuotes.length > 0
            : d.whyPrimaryForDisplay || d.verdictQuotes.length > 0 || d.evidenceChips.length > 0
        ) ? (
          <WhyVerdictEvidence
            hideHero={hideHero}
            whyPrimaryForDisplay={d.whyPrimaryForDisplay}
            verdictQuotes={d.verdictQuotes}
            evidenceChips={d.evidenceChips}
          />
        ) : null}

        <DecisionTrace
          decisionStandardLabel={d.decisionStandardLabel}
          traceDisplay={d.traceDisplay}
          traceCopyValue={d.traceCopyValue}
          hasProvenanceHash={Boolean(score.provenanceHash)}
          controlsOk={d.controlsOk}
        />

        {d.hasScoreCalculationDetails ? <ScoreCalculation score={score} /> : null}

        {score.rubricSnapshot ? (
          <button
            type="button"
            onClick={() => setRubricOpen(true)}
            className="w-fit rounded-md px-1 py-0.5 text-sm font-medium text-[var(--accent)] underline-offset-2 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
          >
            View rubric used
          </button>
        ) : null}
      </div>

      {rubricOpen ? <RubricModal score={score} onClose={() => setRubricOpen(false)} /> : null}
    </>
  );
}
