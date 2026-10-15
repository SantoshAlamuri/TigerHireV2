/**
 * Frozen JD Base rubric captured at hybrid FitScore persist time.
 * Survives in-place jd_base_documents updates (version bumps, re-approvals).
 */

import type { JDBaseDocument } from "./types";

export const HYBRID_JD_BASE_RUBRIC_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export const HYBRID_JD_BASE_LINEAGE_CAPTURED = "captured" as const;
export const HYBRID_JD_BASE_LINEAGE_BACKFILL_ACCURATE = "backfill_accurate" as const;
export const HYBRID_JD_BASE_LINEAGE_UNKNOWN_PRE_APPROVAL = "unknown_pre_approval" as const;

export type HybridJdBaseLineageStatus =
  | typeof HYBRID_JD_BASE_LINEAGE_CAPTURED
  | typeof HYBRID_JD_BASE_LINEAGE_BACKFILL_ACCURATE
  | typeof HYBRID_JD_BASE_LINEAGE_UNKNOWN_PRE_APPROVAL;

export interface HybridJdBaseRubricSnapshot {
  schema_version: typeof HYBRID_JD_BASE_RUBRIC_SNAPSHOT_SCHEMA_VERSION;
  lineage_status?: HybridJdBaseLineageStatus;
  captured_at: string;
  jd_base_document_id: string;
  jd_base_version: number;
  job_id: string;
  role_title: string;
  company: string;
  context: string;
  weights: JDBaseDocument["weights"];
  score_floor: number;
  fit_thresholds: JDBaseDocument["fitThresholds"];
  ideal_candidate_profile: JDBaseDocument["idealCandidateProfile"];
  structured_jd: JDBaseDocument["structuredJd"];
  extraction_additions: string | null;
  approved_by: string | null;
  approved_at: string | null;
  /** Set only when snapshot was reconstructed after the fact (migration backfill). */
  backfill?: boolean;
}

export function buildHybridJdBaseRubricSnapshot(
  jdBase: JDBaseDocument,
  options?: { capturedAt?: string; backfill?: boolean },
): HybridJdBaseRubricSnapshot {
  return {
    schema_version: HYBRID_JD_BASE_RUBRIC_SNAPSHOT_SCHEMA_VERSION,
    lineage_status: options?.backfill
      ? HYBRID_JD_BASE_LINEAGE_BACKFILL_ACCURATE
      : HYBRID_JD_BASE_LINEAGE_CAPTURED,
    captured_at: options?.capturedAt ?? new Date().toISOString(),
    jd_base_document_id: jdBase.id,
    jd_base_version: jdBase.version ?? 1,
    job_id: jdBase.jobId,
    role_title: jdBase.roleTitle,
    company: jdBase.company,
    context: jdBase.context,
    weights: jdBase.weights,
    score_floor: jdBase.scoreFloor,
    fit_thresholds: jdBase.fitThresholds,
    ideal_candidate_profile: jdBase.idealCandidateProfile ?? null,
    structured_jd: jdBase.structuredJd ?? null,
    extraction_additions: jdBase.extractionAdditions ?? null,
    approved_by: jdBase.approvedBy ?? null,
    approved_at: jdBase.approvedAt ?? null,
    ...(options?.backfill ? { backfill: true } : {}),
  };
}

/**
 * True when score lineage indicates the rubric may not match the current JD Base.
 * Requires a JD Base link on the score row; legacy rows without linkage are not flagged.
 */
export function isFitScoreJdBaseStale(
  scoreJdBaseVersion: number | null | undefined,
  currentJdBaseVersion: number | null | undefined,
  scoreHasJdBaseLink = false,
): boolean {
  if (!scoreHasJdBaseLink) return false;
  if (currentJdBaseVersion == null) return false;
  if (scoreJdBaseVersion == null) return true;
  return scoreJdBaseVersion < currentJdBaseVersion;
}
