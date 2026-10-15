"use client";

import type { JdBasePayload } from "./jd-base-setup-types";

import { useCallback, useEffect, useMemo, useState } from "react";
import { JdBaseApprovalWizard } from "@/components/fitscore/jd-base/JdBaseApprovalWizard";
import type { JdBaseWizardVariant } from "@/components/fitscore/jd-base/JdBaseApprovalWizard";
import { JdBaseTemplateConfirmation } from "@/components/fitscore/JdBaseTemplateConfirmation";
import { DEFAULT_FIT_THRESHOLDS, DEFAULT_SCORE_FLOOR } from "@/lib/fitscore/hybrid/constants";

interface GateState {
  canScore: boolean;
  loading: boolean;
  message?: string;
}

interface JdBaseSetupStepProps {
  jobId: string;
  variant?: JdBaseWizardVariant;
  onGateChange?: (state: GateState) => void;
  scrollAnchorId?: string;
  guidedStep?: 1 | 2;
  onRequirementsSaved?: () => void;
  onGuidedApproved?: () => void;
}

function parseApiJson(resJson: unknown): { data?: Record<string, unknown>; error?: string } {
  if (!resJson || typeof resJson !== "object") return {};
  const body = resJson as Record<string, unknown>;
  return {
    data: (body.data as Record<string, unknown> | undefined) ?? body,
    error: typeof body.error === "string" ? body.error : undefined,
  };
}

export function JdBaseSetupStep({
  jobId,
  variant = "recruit",
  onGateChange,
  scrollAnchorId,
  guidedStep,
  onRequirementsSaved,
  onGuidedApproved,
}: JdBaseSetupStepProps) {
  const [jdBase, setJdBase] = useState<JdBasePayload | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescriptionText, setJobDescriptionText] = useState("");
  const [pendingScoringCount, setPendingScoringCount] = useState(0);
  const [loading, setLoading] = useState(true);
  /** True while waiting for the background JD Base generation kicked off at publish. */
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gateEnabled, setGateEnabled] = useState(true);
  const [presetBlocksApproval, setPresetBlocksApproval] = useState(false);

  const canScore = !gateEnabled || Boolean(jdBase?.approvedBy);
  const gateMessage = useMemo(() => {
    if (!gateEnabled) return undefined;
    if (preparing) return "Preparing scoring setup for this role — usually under half a minute.";
    if (loading) return "Checking scoring setup...";
    if (error) return "Scoring setup is currently unavailable.";
    if (!jdBase?.approvedBy) {
      return variant === "agency"
        ? "Approve the ideal profile and rubric before agency candidates are scored."
        : "Approve the ideal profile and rubric to enable scoring for this job.";
    }
    return undefined;
  }, [error, gateEnabled, jdBase?.approvedBy, loading, preparing, variant]);

  useEffect(() => {
    onGateChange?.({ canScore, loading, message: gateMessage });
  }, [canScore, gateMessage, loading, onGateChange]);

  const fetchJdBase = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const res = await fetch(`/api/fitscore/jd-base?jobId=${encodeURIComponent(jobId)}`, {
          credentials: "include",
        });
        const parsed = parseApiJson(await res.json().catch(() => ({})));
        if (res.status === 403 && parsed.error === "Hybrid FitScore v2 is not enabled.") {
          setGateEnabled(false);
          setJdBase(null);
          return;
        }
        if (!res.ok) {
          throw new Error(parsed.error ?? "Failed to load Ideal Profile setup.");
        }
        const fromGet = (parsed.data?.jdBase as JdBasePayload | null | undefined) ?? null;
        const pendingFromGet = Number(parsed.data?.pendingScoringCount ?? 0);
        setPendingScoringCount(Number.isFinite(pendingFromGet) ? pendingFromGet : 0);
        setJobTitle(String(parsed.data?.jobTitle ?? ""));
        setJobDescriptionText(String(parsed.data?.jobDescriptionText ?? ""));
        if (fromGet) {
          setJdBase(fromGet);
          return;
        }

        // Publish no longer waits for the JD Base: it is generated in the background
        // right after the job is created (~20s). Give that a chance to land before
        // asking the server to generate a second copy — otherwise the wait we removed
        // from Publish would simply reappear here, twice.
        setPreparing(true);
        try {
          for (let attempt = 0; attempt < 15; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            const again = await fetch(`/api/fitscore/jd-base?jobId=${encodeURIComponent(jobId)}`, {
              credentials: "include",
            });
            if (!again.ok) break;
            const againParsed = parseApiJson(await again.json().catch(() => ({})));
            const landed = (againParsed.data?.jdBase as JdBasePayload | null | undefined) ?? null;
            if (landed) {
              setJdBase(landed);
              return;
            }
          }
        } finally {
          setPreparing(false);
        }

        const createRes = await fetch("/api/fitscore/jd-base", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ jobId }),
        });
        const createParsed = parseApiJson(await createRes.json().catch(() => ({})));
        if (!createRes.ok) {
          throw new Error(createParsed.error ?? "Failed to generate Ideal Profile setup.");
        }
        setJdBase((createParsed.data?.jdBase as JdBasePayload | undefined) ?? null);
        setJobTitle(String(createParsed.data?.jobTitle ?? ""));
        setJobDescriptionText(String(createParsed.data?.jobDescriptionText ?? ""));
        setPendingScoringCount(0);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load setup.";
        setError(message);
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [jobId],
  );

  useEffect(() => {
    void fetchJdBase();
  }, [fetchJdBase]);

  if (!gateEnabled) return null;

  return (
    <section id={scrollAnchorId} className="mt-8">
      <div className="card-lifted p-5 backdrop-blur-md">
        <h2 className="heading-section text-lg text-[var(--text)]">Scoring setup</h2>
        <p className="mt-1 text-sm text-white/60">
          Review hiring requirements and evaluation criteria before approving scoring.
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-white/60">Loading setup...</p>
        ) : error ? (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <p className="text-sm text-red-300">{error}</p>
            <button
              type="button"
              onClick={() => void fetchJdBase()}
              className="mt-2 text-xs font-medium text-red-200 underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        ) : jdBase ? (
          <details open={guidedStep ? true : jdBase.approvedBy ? undefined : true}>
            <summary className="mt-3 cursor-pointer text-sm font-semibold text-[var(--text)]">
              {jdBase.approvedBy
                ? "Evaluation approved — review or edit"
                : "Review requirements and evaluation"}
            </summary>
            <JdBaseTemplateConfirmation
              jobId={jobId}
              scoringFoundation={jdBase.scoringFoundation ?? "llm"}
              indiaTemplateId={jdBase.indiaTemplateId ?? null}
              indiaTemplateCategory={jdBase.indiaTemplateCategory ?? null}
              indiaTemplateRoleTitle={jdBase.indiaTemplateRoleTitle ?? null}
              onApplied={() => void fetchJdBase()}
              onBlockingChange={setPresetBlocksApproval}
            />
            <JdBaseApprovalWizard
              guidedStep={guidedStep}
              onRequirementsSaved={onRequirementsSaved}
              className="mt-4"
              jobId={jobId}
              variant={variant}
              jobTitle={jobTitle || jdBase.roleTitle}
              jobDescriptionText={jobDescriptionText}
              scoringPresetBlocksApproval={presetBlocksApproval}
              initialWeights={jdBase.weights}
              initialThresholds={jdBase.fitThresholds ?? DEFAULT_FIT_THRESHOLDS}
              initialScoreFloor={jdBase.scoreFloor ?? DEFAULT_SCORE_FLOOR}
              initialContext={jdBase.context ?? ""}
              initialExtractionAdditions={jdBase.extractionAdditions ?? ""}
              initialIdealProfile={jdBase.idealCandidateProfile ?? null}
              initialStructuredJd={jdBase.structuredJd ?? null}
              approvedBy={jdBase.approvedBy ?? null}
              approvedAt={jdBase.approvedAt ?? null}
              pendingScoringCount={pendingScoringCount}
              indiaTemplateId={jdBase.indiaTemplateId ?? null}
              indiaTemplateRoleTitle={jdBase.indiaTemplateRoleTitle ?? null}
              onSaved={() => {
                void fetchJdBase({ silent: true });
              }}
              onApproved={() => {
                onGuidedApproved?.();
                void fetchJdBase({ silent: true });
              }}
            />
          </details>
        ) : (
          <p className="mt-4 text-sm text-white/60">No JD Base available for this job yet.</p>
        )}
      </div>
    </section>
  );
}
