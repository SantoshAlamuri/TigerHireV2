/**
 * FitScore v2.0 — append-only extraction audit rows (Supabase).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

export type FitscoreExtractionEventType =
  | "extraction_success"
  | "extraction_fallback"
  | "critical_fields_missing"
  | "extraction_error"
  | "parse_error";

export interface FitscoreExtractionLogInsert {
  candidate_id: string;
  job_id: string;
  event_type: FitscoreExtractionEventType;
  parse_quality_score?: number | null;
  /** Stage 2A: haiku | sonnet only (default pipeline). */
  extraction_model?: string | null;
  extraction_fallback?: boolean | null;
  has_experience?: boolean | null;
  has_tools?: boolean | null;
  has_evidence?: boolean | null;
  failure_reason?: string | null;
  failure_detail?: string | null;
  resume_format?: string | null;
  resume_pages?: number | null;
  has_tables?: boolean | null;
  has_columns?: boolean | null;
}

export async function insertFitscoreExtractionLog(
  supabase: SupabaseClient,
  row: FitscoreExtractionLogInsert,
): Promise<void> {
  const { error } = await supabase.from("fitscore_extraction_log").insert({
    candidate_id: row.candidate_id,
    job_id: row.job_id,
    event_type: row.event_type,
    parse_quality_score: row.parse_quality_score ?? null,
    extraction_model: row.extraction_model ?? null,
    extraction_fallback: row.extraction_fallback ?? false,
    has_experience: row.has_experience ?? null,
    has_tools: row.has_tools ?? null,
    has_evidence: row.has_evidence ?? null,
    failure_reason: row.failure_reason ?? null,
    failure_detail: row.failure_detail ?? null,
    resume_format: row.resume_format ?? null,
    resume_pages: row.resume_pages ?? null,
    has_tables: row.has_tables ?? null,
    has_columns: row.has_columns ?? null,
  });
  if (error) {
    // Non-fatal: scoring must not fail because logging failed
    logger.warn("[fitscore_extraction_log] insert failed", {
      message: error.message,
      code: error.code,
      candidate_id: row.candidate_id,
      job_id: row.job_id,
      event_type: row.event_type,
    });
  }
}
