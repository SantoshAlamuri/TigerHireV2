"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeWeightsTo100 } from "@/lib/fitscore/hybrid/templates";
import { EditableStringList } from "@/components/fitscore/jd-base/EditableStringList";
import {
  mergeCertificationsIntoBenchmarks,
  parseCertificationsFromBenchmarks,
} from "@/lib/fitscore/jd-base-approval/certifications";
import { formatDimensionLabel } from "@/lib/fitscore/jd-base-approval/dimension-labels";
import {
  buildReviewRows,
  detectJdBaseMismatches,
} from "@/lib/fitscore/jd-base-approval/mismatch-detection";
import {
  formatYearsRange,
  parseYearsRange,
  roleLevelFromYearsRange,
  suggestLevelFromJobText,
  yearsRangeForLevel,
  type RoleLevel,
} from "@/lib/fitscore/jd-base-approval/years-range";
import { DEFAULT_FIT_THRESHOLDS, DEFAULT_SCORE_FLOOR } from "@/lib/fitscore/hybrid/constants";
import { getIndiaJdTemplateById } from "@/lib/fitscore/hybrid/jd-india-templates";
import type {
  FitThresholds,
  IdealCandidateProfile,
  ScoringWeights,
} from "@/lib/fitscore/hybrid/types";

export type JdBaseWizardVariant = "recruit" | "agency" | "company";

export type JdBaseWizardStructuredJd = {
  must_haves?: string[];
  need_to_haves?: string[];
  nice_to_haves?: string[];
  responsibilities?: string[];
  role_basics?: Record<string, unknown>;
} | null;

export type JdBaseApprovalWizardProps = {
  jobId: string;
  variant?: JdBaseWizardVariant;
  jobTitle: string;
  jobDescriptionText: string;
  initialWeights: ScoringWeights;
  initialThresholds: FitThresholds;
  initialScoreFloor: number;
  initialContext: string;
  initialExtractionAdditions?: string | null;
  initialIdealProfile?: IdealCandidateProfile | null;
  /** Existing structured JD (need-to-haves etc.) so reopening the wizard doesn't wipe it on save. */
  initialStructuredJd?: JdBaseWizardStructuredJd;
  approvedBy?: string | null;
  approvedAt?: string | null;
  pendingScoringCount?: number;
  scoringPresetBlocksApproval?: boolean;
  indiaTemplateId?: string | null;
  indiaTemplateRoleTitle?: string | null;
  onSaved?: () => void;
  onApproved?: () => void;
  className?: string;
  guidedStep?: 1 | 2;
  onRequirementsSaved?: () => void;
};

const STEPS = [
  // Name the score each step drives, so ICP (who → ICP Match) and Rubric (how → FitScore)
  // never blur into one thing.
  { id: 1, title: "What are you hiring for?", subtitle: "Ideal Profile (ICP) → ICP Match" },
  { id: 2, title: "How should we weight scoring?", subtitle: "Scoring rubric → FitScore" },
  { id: 3, title: "Review & approve", subtitle: "Compare JD vs scoring setup" },
] as const;

const ROLE_LEVELS: { value: RoleLevel; label: string }[] = [
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
];

function parseApiError(body: unknown): string {
  if (!body || typeof body !== "object") return "Request failed";
  const record = body as Record<string, unknown>;
  if (typeof record.error === "string") return record.error;
  return "Request failed";
}

function copyForVariant(variant: JdBaseWizardVariant) {
  if (variant === "agency") {
    return {
      intro:
        "Define who the client is hiring for and how candidates will be scored before agency submissions are ranked.",
      approve: "Approve & start scoring",
    };
  }
  if (variant === "company") {
    return {
      intro:
        "Review who you are hiring for and how candidates will be scored. Your approval unlocks FitScore for this role.",
      approve: "Approve & start scoring",
    };
  }
  return {
    intro:
      "Review who you are hiring for and how candidates will be scored. Hiring manager approval is required before scoring.",
    approve: "Approve & start scoring",
  };
}

export function JdBaseApprovalWizard({
  jobId,
  variant = "recruit",
  jobTitle,
  jobDescriptionText,
  initialWeights,
  initialThresholds,
  initialScoreFloor,
  initialContext,
  initialExtractionAdditions = "",
  initialIdealProfile = null,
  initialStructuredJd = null,
  approvedBy: initialApprovedBy = null,
  approvedAt: initialApprovedAt = null,
  pendingScoringCount = 0,
  scoringPresetBlocksApproval = false,
  indiaTemplateId = null,
  indiaTemplateRoleTitle = null,
  onSaved,
  onApproved,
  className = "",
  guidedStep,
  onRequirementsSaved,
}: JdBaseApprovalWizardProps) {
  const copy = copyForVariant(variant);
  const suggestedTemplate = useMemo(
    () => (indiaTemplateId ? getIndiaJdTemplateById(indiaTemplateId) : undefined),
    [indiaTemplateId],
  );
  const suggestedWeights = suggestedTemplate?.weights ?? initialWeights;

  const initialYears = parseYearsRange(initialIdealProfile?.years_range ?? "");
  const [step, setStep] = useState<1 | 2 | 3>(initialApprovedBy ? 3 : 1);
  /** Highest step the user has reached via Save & continue (enforces linear flow). */
  const [maxStepReached, setMaxStepReached] = useState<1 | 2 | 3>(initialApprovedBy ? 3 : 1);
  useEffect(() => {
    if (guidedStep) setStep(guidedStep);
  }, [guidedStep]);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [roleLevel, setRoleLevel] = useState<RoleLevel>(() =>
    initialIdealProfile?.years_range
      ? roleLevelFromYearsRange(initialIdealProfile.years_range)
      : suggestLevelFromJobText(jobDescriptionText),
  );
  const [yearsMin, setYearsMin] = useState(initialYears?.min ?? 2);
  const [yearsMax, setYearsMax] = useState(initialYears?.max ?? 4);
  const [idealSummary, setIdealSummary] = useState(initialIdealProfile?.summary ?? "");
  const [mustHaves, setMustHaves] = useState<string[]>(initialIdealProfile?.must_haves ?? []);
  const [needToHaves, setNeedToHaves] = useState<string[]>(
    initialStructuredJd?.need_to_haves ?? [],
  );
  const [niceToHaves, setNiceToHaves] = useState<string[]>(
    initialIdealProfile?.nice_to_haves ?? [],
  );
  const [certifications, setCertifications] = useState<string[]>(() =>
    parseCertificationsFromBenchmarks(initialIdealProfile?.benchmarks),
  );
  const [outcomes, setOutcomes] = useState<string[]>(initialIdealProfile?.outcomes ?? []);
  const [competencies, setCompetencies] = useState<string[]>(
    initialIdealProfile?.competencies ?? [],
  );
  const [traits, setTraits] = useState<string[]>(initialIdealProfile?.traits ?? []);
  const [backgroundPreferences, setBackgroundPreferences] = useState<string[]>(
    initialIdealProfile?.background_preferences ?? [],
  );

  const [weights, setWeights] = useState<ScoringWeights>(() =>
    normalizeWeightsTo100(initialWeights),
  );
  const [thresholds] = useState<FitThresholds>(initialThresholds);
  const [scoreFloor] = useState(initialScoreFloor);
  const [context] = useState(initialContext);
  const [extractionAdditions] = useState(initialExtractionAdditions ?? "");

  const [currentApprovedBy, setCurrentApprovedBy] = useState(initialApprovedBy);
  const [currentApprovedAt, setCurrentApprovedAt] = useState(initialApprovedAt);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const weightKeys = useMemo(() => Object.keys(weights).sort(), [weights]);
  const weightSum = weightKeys.reduce((s, k) => s + (weights[k] ?? 0), 0);

  useEffect(() => {
    // Only normalize when entering the rubric step — the updater re-derives the
    // sum itself, so mid-edit weight changes never retrigger this.
    if (step === 2) {
      setWeights((w) => {
        const sum = Object.values(w).reduce((s, v) => s + (v ?? 0), 0);
        return sum === 100 ? w : normalizeWeightsTo100(w);
      });
    }
  }, [step]);

  const idealProfilePayload = useMemo((): IdealCandidateProfile => {
    const benchmarks = mergeCertificationsIntoBenchmarks(
      initialIdealProfile?.benchmarks ?? {},
      certifications,
    );
    return {
      summary: idealSummary.trim() || `Ideal ${jobTitle} candidate`,
      must_haves: mustHaves,
      nice_to_haves: niceToHaves,
      years_range: formatYearsRange(yearsMin, yearsMax),
      benchmarks,
      outcomes,
      competencies,
      traits,
      background_preferences: backgroundPreferences,
    };
  }, [
    idealSummary,
    mustHaves,
    niceToHaves,
    yearsMin,
    yearsMax,
    certifications,
    outcomes,
    competencies,
    traits,
    backgroundPreferences,
    jobTitle,
    initialIdealProfile?.benchmarks,
  ]);

  const mismatches = useMemo(
    () =>
      detectJdBaseMismatches({
        jobDescriptionText,
        jobTitle,
        idealProfile: idealProfilePayload,
        weights,
        templateId: indiaTemplateId,
        templateWeights: suggestedTemplate?.weights ?? null,
      }),
    [
      jobDescriptionText,
      jobTitle,
      idealProfilePayload,
      weights,
      indiaTemplateId,
      suggestedTemplate?.weights,
    ],
  );

  const reviewRows = useMemo(
    () =>
      buildReviewRows({
        jobDescriptionText,
        idealProfile: idealProfilePayload,
        weights,
      }),
    [jobDescriptionText, idealProfilePayload, weights],
  );

  const saveDraft = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    const normalizedWeights = normalizeWeightsTo100(weights);
    if (Object.keys(normalizedWeights).length > 0) {
      setWeights(normalizedWeights);
    }
    try {
      const payload: Record<string, unknown> = {
        jobId,
        weights: normalizedWeights,
        fitThresholds: thresholds,
        scoreFloor,
        extractionAdditions: extractionAdditions.trim() || null,
        idealCandidateProfile: idealProfilePayload,
        structuredJd: {
          // Preserve fields the wizard doesn't edit (responsibilities, role basics).
          role_basics: { ...(initialStructuredJd?.role_basics ?? {}), title: jobTitle },
          responsibilities: initialStructuredJd?.responsibilities ?? [],
          must_haves: mustHaves,
          need_to_haves: needToHaves,
          nice_to_haves: niceToHaves,
        },
      };
      const trimmedContext = context.trim();
      if (trimmedContext) payload.context = trimmedContext;

      const res = await fetch("/api/fitscore/jd-base", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(parseApiError(data));
        return false;
      }
      setCurrentApprovedBy(null);
      setCurrentApprovedAt(null);
      setLastSavedAt(Date.now());
      setMessage("Saved.");
      onSaved?.();
      return true;
    } catch {
      setMessage("Network error while saving");
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    jobId,
    weights,
    thresholds,
    scoreFloor,
    context,
    extractionAdditions,
    idealProfilePayload,
    jobTitle,
    mustHaves,
    needToHaves,
    niceToHaves,
    initialStructuredJd,
    onSaved,
  ]);

  const approve = useCallback(async () => {
    setApproving(true);
    setMessage(null);
    const saved = await saveDraft();
    if (!saved) {
      setApproving(false);
      return;
    }
    try {
      const res = await fetch("/api/fitscore/jd-base/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(parseApiError(data));
        return;
      }
      const jdBase =
        (data as { jdBase?: { approvedBy?: string; approvedAt?: string } }).jdBase ??
        (data as { data?: { jdBase?: { approvedBy?: string; approvedAt?: string } } }).data?.jdBase;
      setCurrentApprovedBy(jdBase?.approvedBy ?? "approved");
      setCurrentApprovedAt(jdBase?.approvedAt ?? new Date().toISOString());
      setMessage((data as { message?: string }).message ?? "Approved — scoring is now enabled.");
      onApproved?.();
    } catch {
      setMessage("Network error while approving");
    } finally {
      setApproving(false);
    }
  }, [jobId, saveDraft, onApproved]);

  const onRoleLevelChange = (level: RoleLevel) => {
    setRoleLevel(level);
    const range = parseYearsRange(yearsRangeForLevel(level));
    if (range) {
      setYearsMin(range.min);
      setYearsMax(range.max);
    }
  };

  const updateWeight = (key: string, value: number) => {
    setWeights((w) => ({ ...w, [key]: Math.max(0, Math.round(value)) }));
  };

  const normalizeWeightsLocally = () => {
    setWeights((w) => normalizeWeightsTo100(w));
  };

  const goToStep = (target: 1 | 2 | 3) => {
    if (target <= maxStepReached) setStep(target);
  };

  const continueToNextStep = async () => {
    const ok = await saveDraft();
    if (!ok) return;
    const next = Math.min(step + 1, 3) as 1 | 2 | 3;
    setMaxStepReached((prev) => (next > prev ? next : prev));
    setStep(next);
    if (guidedStep && step === 1) onRequirementsSaved?.();
    setMessage(null);
  };

  const isApproved = !!currentApprovedBy;
  const approveBlockedByPreset = scoringPresetBlocksApproval && !isApproved;

  return (
    <div className={`space-y-6 ${className}`}>
      <p className="text-sm text-white/60">{copy.intro}</p>

      {isApproved ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm font-medium text-emerald-200">Approved — scoring enabled</p>
          {currentApprovedAt && (
            <p className="mt-1 text-xs text-emerald-300/80">
              {new Date(currentApprovedAt).toLocaleString("en-GB")}
            </p>
          )}
        </div>
      ) : (
        <WizardPendingBanner
          pendingScoringCount={pendingScoringCount}
          scoringPresetBlocksApproval={scoringPresetBlocksApproval}
        />
      )}

      {!guidedStep && (
        <nav className="flex flex-wrap gap-2" aria-label="Approval steps">
          {STEPS.map((s) => {
            const reachable = s.id <= maxStepReached;
            return (
              <button
                key={s.id}
                type="button"
                disabled={!reachable}
                onClick={() => goToStep(s.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  step === s.id
                    ? "bg-[var(--accent)] text-black"
                    : reachable
                      ? "border border-white/15 text-white/60 hover:text-white/90"
                      : "cursor-not-allowed border border-white/10 text-white/30"
                }`}
              >
                {s.id}. {s.title}
              </button>
            );
          })}
        </nav>
      )}
      {lastSavedAt && (
        <p className="text-xs text-emerald-300/80">
          Last saved {new Date(lastSavedAt).toLocaleTimeString("en-GB")}
        </p>
      )}

      {step === 1 && (
        <section className="space-y-5 rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <header>
            <h3 className="text-base font-semibold text-[var(--text)]">{STEPS[0].title}</h3>
            <p className="mt-1 text-sm text-white/55">{STEPS[0].subtitle}</p>
          </header>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm">
              <span className="text-white/70">Role level</span>
              <select
                value={roleLevel}
                onChange={(e) => onRoleLevelChange(e.target.value as RoleLevel)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"
              >
                {ROLE_LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-white/70">Years (min)</span>
              <input
                type="number"
                min={0}
                max={40}
                value={yearsMin}
                onChange={(e) => setYearsMin(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="text-white/70">Years (max)</span>
              <input
                type="number"
                min={0}
                max={40}
                value={yearsMax}
                onChange={(e) => setYearsMax(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="text-white/70">Profile summary</span>
            <textarea
              value={idealSummary}
              onChange={(e) => setIdealSummary(e.target.value)}
              rows={3}
              placeholder="Short description of the ideal hire"
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"
            />
          </label>

          <div>
            <p className="mb-2 text-sm font-medium text-white/80">Must-haves</p>
            <EditableStringList
              items={mustHaves}
              onChange={setMustHaves}
              placeholder="Add a must-have requirement"
              addLabel="+ Add requirement"
              variant="must"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-white/80">Need-to-haves</p>
            <p className="mb-2 text-xs text-white/50">
              Important but not gating — capped weight in scoring when structured JD is enabled.
            </p>
            <EditableStringList
              items={needToHaves}
              onChange={setNeedToHaves}
              placeholder="Add a need-to-have"
              addLabel="+ Add need-to-have"
              variant="nice"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-white/80">Nice-to-haves</p>
            <EditableStringList
              items={niceToHaves}
              onChange={setNiceToHaves}
              placeholder="Add a nice-to-have"
              addLabel="+ Add preference"
              variant="nice"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-white/80">Certifications that matter</p>
            <EditableStringList
              items={certifications}
              onChange={setCertifications}
              placeholder="e.g. ISTQB"
              addLabel="+ Add certification"
              variant="cert"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-white/80">Outcomes to deliver</p>
            <p className="mb-2 text-xs text-white/50">
              The measurable results this hire must achieve in the first 6–12 months — most
              important first. Defines what &quot;good&quot; looks like beyond a skills list.
            </p>
            <EditableStringList
              items={outcomes}
              onChange={setOutcomes}
              placeholder="e.g. Cut reporting turnaround from 5 days to 1 by Q2"
              addLabel="+ Add outcome"
              variant="nice"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-white/80">Key competencies</p>
            <p className="mb-2 text-xs text-white/50">
              Role-specific behaviours that predict success — the strongest signal in the research.
              Phrase each as an observable capability.
            </p>
            <EditableStringList
              items={competencies}
              onChange={setCompetencies}
              placeholder="e.g. Structures ambiguous problems independently"
              addLabel="+ Add competency"
              variant="nice"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-white/80">Ideal traits</p>
            <p className="mb-2 text-xs text-white/50">
              Softer, general attributes scored via CV language and later WhatsApp.
            </p>
            <EditableStringList
              items={traits}
              onChange={setTraits}
              placeholder="e.g. Takes ownership without being asked"
              addLabel="+ Add trait"
              variant="nice"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-white/80">Ideal background</p>
            <p className="mb-2 text-xs text-white/50">
              Career-shape preferences (company type, ways of working).
            </p>
            <EditableStringList
              items={backgroundPreferences}
              onChange={setBackgroundPreferences}
              placeholder="e.g. Product company experience preferred"
              addLabel="+ Add background signal"
              variant="nice"
            />
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-5 rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <header>
            <h3 className="text-base font-semibold text-[var(--text)]">{STEPS[1].title}</h3>
            <p className="mt-1 text-sm text-white/55">{STEPS[1].subtitle}</p>
          </header>

          <p className="text-xs text-white/50">
            Target sum: 100% — current:{" "}
            <span className={weightSum === 100 ? "text-emerald-300" : "text-amber-300"}>
              {weightSum}%
            </span>
            {weightSum !== 100 && (
              <button
                type="button"
                onClick={normalizeWeightsLocally}
                className="ml-2 underline underline-offset-2"
              >
                Normalize to 100%
              </button>
            )}
          </p>

          <div className="space-y-4">
            {weightKeys.map((key) => (
              <label key={key} className="block">
                <WeightSliderRow
                  label={formatDimensionLabel(key)}
                  value={weights[key] ?? 0}
                  onChange={(v) => updateWeight(key, v)}
                />
              </label>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setWeights(normalizeWeightsTo100({ ...suggestedWeights }))}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
            >
              Reset to suggested
            </button>
          </div>

          {indiaTemplateId && (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-100/90">
              <p>
                Template suggestion: <strong>{indiaTemplateId}</strong>
                {indiaTemplateRoleTitle ? ` (${indiaTemplateRoleTitle})` : ""}
              </p>
              {mismatches
                .filter((m) => m.id === "template_automation_vs_jd")
                .map((m) => (
                  <p key={m.id} className="mt-2 text-xs">
                    ⚠️ {m.message}
                  </p>
                ))}
            </div>
          )}
        </section>
      )}

      {step === 3 && (
        <section className="space-y-5 rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <header>
            <h3 className="text-base font-semibold text-[var(--text)]">{STEPS[2].title}</h3>
            <p className="mt-1 text-sm text-white/55">{STEPS[2].subtitle}</p>
          </header>

          <div className="grid gap-0 overflow-hidden rounded-lg border border-white/15 md:grid-cols-2">
            <div className="border-b border-white/10 bg-white/[0.02] p-4 md:border-b-0 md:border-r">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
                Your JD says
              </p>
              <ul className="mt-3 space-y-2 text-sm text-white/80">
                {reviewRows.map((row) => (
                  <li key={row.jdLabel}>{row.jdLabel}</li>
                ))}
              </ul>
            </div>
            <div className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
                Scoring will use
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {reviewRows.map((row) => (
                  <li
                    key={row.scoringLabel}
                    className={row.ok ? "text-emerald-200" : "text-red-300"}
                  >
                    {row.scoringLabel} {row.ok ? "✅" : "⚠️"}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {mismatches.length === 0 ? (
            <p className="text-sm text-emerald-300">✅ No mismatches detected</p>
          ) : (
            <ul className="space-y-2">
              {mismatches.map((m) => (
                <li
                  key={m.id}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    m.severity === "error"
                      ? "border-red-500/40 bg-red-500/10 text-red-200"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-100"
                  }`}
                >
                  {m.message}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div
        className={
          guidedStep
            ? "sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-[var(--border)] bg-[var(--bg)] py-3"
            : "flex flex-wrap items-center gap-3"
        }
      >
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/80"
          >
            Back
          </button>
        )}
        {step < 3 ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void continueToNextStep()}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            {saving
              ? "Saving…"
              : step === 1
                ? "Save ICP & continue to rubric"
                : "Save rubric & review"}
          </button>
        ) : (
          <>
            {!isApproved && (
              <button
                type="button"
                onClick={() => void approve()}
                disabled={approving || saving || approveBlockedByPreset}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {approving ? "Approving…" : copy.approve}
              </button>
            )}
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/80"
            >
              Back to edit
            </button>
          </>
        )}
        {approveBlockedByPreset && step === 3 && (
          <p className="w-full text-xs text-amber-300">
            Click &quot;Yes, this preset fits&quot; in the role preset section above before
            approving.
          </p>
        )}
        {message && (
          <p className={`text-sm ${message === "Saved." ? "text-emerald-300/90" : "text-red-300"}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

function WizardPendingBanner({
  pendingScoringCount,
  scoringPresetBlocksApproval,
}: {
  pendingScoringCount: number;
  scoringPresetBlocksApproval: boolean;
}) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <p className="text-sm font-medium text-amber-100">Awaiting approval — scoring blocked</p>
      {pendingScoringCount > 0 && (
        <p className="mt-1 text-xs text-amber-200/80">
          {pendingScoringCount} candidate{pendingScoringCount === 1 ? "" : "s"} waiting to be scored
          after approval.
        </p>
      )}
      {scoringPresetBlocksApproval && (
        <p className="mt-1 text-xs text-amber-200/80">
          Confirm the role preset above before approving.
        </p>
      )}
    </div>
  );
}

function WeightSliderRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
      <span className="min-w-[12rem] text-sm text-white/80 sm:flex-1">{label}</span>
      <div className="flex flex-1 items-center gap-3">
        <input
          type="range"
          min={0}
          max={50}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-[var(--accent)]"
        />
        <span className="w-12 text-right text-sm tabular-nums text-white/90">{value}%</span>
      </div>
    </div>
  );
}
