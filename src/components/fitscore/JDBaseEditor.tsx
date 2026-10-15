"use client";

import { useCallback, useMemo, useState } from "react";
import type {
  FitThresholds,
  IdealCandidateProfile,
  ScoringWeights,
} from "@/lib/fitscore/hybrid/types";

export interface JDBaseEditorProps {
  jobId: string;
  initialWeights: ScoringWeights;
  initialThresholds: FitThresholds;
  initialScoreFloor: number;
  initialContext: string;
  initialExtractionAdditions?: string | null;
  initialIdealProfile?: IdealCandidateProfile | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  onSaved?: () => void;
  onApproved?: () => void;
  className?: string;
  pendingScoringCount?: number;
  /** When true, Approve is disabled until the hiring team confirms the matched role preset. */
  scoringPresetBlocksApproval?: boolean;
}

export default function JDBaseEditor({
  jobId,
  initialWeights,
  initialThresholds,
  initialScoreFloor,
  initialContext,
  initialExtractionAdditions = "",
  initialIdealProfile = null,
  approvedBy: initialApprovedBy = null,
  approvedAt: initialApprovedAt = null,
  onSaved,
  onApproved,
  className = "",
  pendingScoringCount = 0,
  scoringPresetBlocksApproval = false,
}: JDBaseEditorProps) {
  const [weights, setWeights] = useState<ScoringWeights>(initialWeights);
  const [thresholds, setThresholds] = useState<FitThresholds>(initialThresholds);
  const [scoreFloor, setScoreFloor] = useState(initialScoreFloor);
  const [context, setContext] = useState(initialContext);
  const [extractionAdditions, setExtractionAdditions] = useState(initialExtractionAdditions ?? "");
  const [idealSummary, setIdealSummary] = useState(initialIdealProfile?.summary ?? "");
  const [mustHaves, setMustHaves] = useState<string[]>(initialIdealProfile?.must_haves ?? []);
  const [mustHaveInput, setMustHaveInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [currentApprovedBy, setCurrentApprovedBy] = useState(initialApprovedBy);
  const [currentApprovedAt, setCurrentApprovedAt] = useState(initialApprovedAt);
  const [hasUnsavedWeightChanges, setHasUnsavedWeightChanges] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const weightKeys = useMemo(() => Object.keys(weights).sort(), [weights]);
  const sum = weightKeys.reduce((s, k) => s + (weights[k] ?? 0), 0);

  const updateWeight = useCallback((key: string, val: string) => {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0) return;
    setWeights((w) => ({ ...w, [key]: n }));
    setHasUnsavedWeightChanges(true);
  }, []);

  const addMustHave = useCallback(() => {
    const val = mustHaveInput.trim();
    if (!val || mustHaves.includes(val)) return;
    setMustHaves((prev) => [...prev, val]);
    setMustHaveInput("");
  }, [mustHaveInput, mustHaves]);

  const removeMustHave = useCallback((item: string) => {
    setMustHaves((prev) => prev.filter((m) => m !== item));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const idealProfile = idealSummary.trim()
        ? {
            summary: idealSummary.trim(),
            must_haves: mustHaves,
            nice_to_haves: initialIdealProfile?.nice_to_haves ?? [],
            years_range: initialIdealProfile?.years_range ?? "",
            benchmarks: initialIdealProfile?.benchmarks ?? {},
          }
        : null;

      const res = await fetch("/api/fitscore/jd-base", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          weights,
          fitThresholds: thresholds,
          scoreFloor,
          context,
          extractionAdditions: extractionAdditions.trim() || null,
          idealCandidateProfile: idealProfile,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(typeof data.error === "string" ? data.error : "Save failed");
        return;
      }
      if (hasUnsavedWeightChanges) {
        setCurrentApprovedBy(null);
        setCurrentApprovedAt(null);
      }
      setHasUnsavedWeightChanges(false);
      setMessage(
        "Saved. " + (hasUnsavedWeightChanges ? "Weights changed — re-approval required." : ""),
      );
      onSaved?.();
    } catch {
      setMessage("Network error");
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
    idealSummary,
    mustHaves,
    initialIdealProfile,
    onSaved,
    hasUnsavedWeightChanges,
  ]);

  const approve = useCallback(async () => {
    setApproving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/fitscore/jd-base/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(typeof data.error === "string" ? data.error : "Approval failed");
        return;
      }
      setCurrentApprovedBy(data.data?.jdBase?.approvedBy ?? "approved");
      setCurrentApprovedAt(data.data?.jdBase?.approvedAt ?? new Date().toISOString());
      setMessage(data.data?.message ?? "Approved — scoring is now enabled.");
      onApproved?.();
    } catch {
      setMessage("Network error");
    } finally {
      setApproving(false);
    }
  }, [jobId, onApproved]);

  const isApproved = !!currentApprovedBy;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Approval status banner */}
      {isApproved ? (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
            <svg
              className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
              Approved — scoring enabled
            </p>
            {currentApprovedAt && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                Approved{" "}
                {new Date(currentApprovedAt).toLocaleDateString("en-GB", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
            <svg
              className="h-4 w-4 text-amber-600 dark:text-amber-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Awaiting approval — scoring blocked
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Review the weights and dimensions below, then approve to enable candidate scoring.
            </p>
            {pendingScoringCount > 0 ? (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                {pendingScoringCount} candidate{pendingScoringCount === 1 ? "" : "s"} pending
                scoring. Approve JD Base to process them.
              </p>
            ) : null}
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Role context
        </label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
        />
      </div>

      {/* Ideal Candidate Profile */}
      <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Ideal Candidate Profile
        </p>
        {initialIdealProfile?.summary && !idealSummary && (
          <p className="text-xs text-zinc-500">{initialIdealProfile.summary}</p>
        )}
        <textarea
          value={idealSummary}
          onChange={(e) => setIdealSummary(e.target.value)}
          rows={3}
          placeholder="Describe the perfect candidate for this role (3-4 sentences)"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
        />
        <div>
          <p className="mb-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">Must-haves</p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {mustHaves.map((mh) => (
              <span
                key={mh}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
              >
                {mh}
                <button
                  type="button"
                  onClick={() => removeMustHave(mh)}
                  className="ml-0.5 text-emerald-600 hover:text-emerald-800 dark:text-emerald-400"
                  aria-label={`Remove ${mh}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={mustHaveInput}
              onChange={(e) => setMustHaveInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addMustHave();
                }
              }}
              placeholder="Add a must-have requirement"
              className="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
            <button
              type="button"
              onClick={addMustHave}
              className="rounded bg-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Extraction additions (optional)
        </label>
        <textarea
          value={extractionAdditions}
          onChange={(e) => setExtractionAdditions(e.target.value)}
          rows={3}
          placeholder="Extra instructions appended to the extraction prompt"
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
        />
      </div>

      <div>
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Weights (target sum 100)
        </p>
        <p className="text-xs text-zinc-500">Current sum: {sum} — server normalizes on save</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {weightKeys.map((key) => (
            <label key={key} className="flex items-center justify-between gap-2 text-sm">
              <span className="capitalize text-zinc-600 dark:text-zinc-400">
                {key.replace(/_/g, " ")}
              </span>
              <input
                type="number"
                min={0}
                value={weights[key]}
                onChange={(e) => updateWeight(key, e.target.value)}
                className="w-20 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Score floor
          </label>
          <input
            type="number"
            min={0}
            max={100}
            value={scoreFloor}
            onChange={(e) => setScoreFloor(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(["strong", "good", "moderate", "weak"] as const).map((k) => (
            <label key={k} className="text-xs">
              <span className="capitalize text-zinc-600 dark:text-zinc-400">{k}</span>
              <input
                type="number"
                value={thresholds[k]}
                onChange={(e) => setThresholds((t) => ({ ...t, [k]: Number(e.target.value) }))}
                className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || approving}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
        {!isApproved && (
          <button
            type="button"
            onClick={() => void approve()}
            disabled={approving || saving || hasUnsavedWeightChanges || scoringPresetBlocksApproval}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-emerald-700"
            title={
              scoringPresetBlocksApproval
                ? "Confirm the role preset above first"
                : hasUnsavedWeightChanges
                  ? "Save your changes before approving"
                  : "Approve weights and enable scoring"
            }
          >
            {approving ? "Approving…" : "Approve & Enable Scoring"}
          </button>
        )}
        {scoringPresetBlocksApproval && !isApproved && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            Confirm the role preset above before enabling scoring
          </span>
        )}
        {hasUnsavedWeightChanges && !isApproved && !scoringPresetBlocksApproval && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            Save changes before approving
          </span>
        )}
        {message && <span className="text-sm text-zinc-600 dark:text-zinc-400">{message}</span>}
      </div>
    </div>
  );
}
