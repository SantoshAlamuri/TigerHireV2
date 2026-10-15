import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CandidateRepository,
  type CandidateListParams,
} from "@/lib/repositories/CandidateRepository";
import { maskCandidateForShortlist } from "@/lib/security/pii";
import { logger } from "@/lib/observability/logger";
import { resolveCvStorageObject } from "@/lib/supabase/resolve-cv-storage";
import { resolveCandidateScreeningFlag } from "@/lib/screening/candidate-flag";

type ScreeningSnapshotRow = {
  candidate_id: string;
  status: string | null;
  mode: string | null;
  updated_at: string | null;
  created_at: string | null;
};

async function attachCandidateScreeningFlags(
  supabase: SupabaseClient,
  candidates: Record<string, unknown>[],
  organisationIds?: string[] | null,
): Promise<Record<string, unknown>[]> {
  if (candidates.length === 0) return candidates;

  const candidateIds = candidates.map((row) => String(row.id ?? "")).filter(Boolean);
  if (candidateIds.length === 0) return candidates;

  let query = supabase
    .from("screening_jobs")
    .select("candidate_id, status, mode, updated_at, created_at")
    .in("candidate_id", candidateIds);

  if (organisationIds && organisationIds.length > 0) {
    query = query.in("organisation_id", organisationIds);
  }

  const { data, error } = await query;
  if (error) {
    logger.warn("Failed loading candidate screening flags", {
      error: String(error),
      candidateCount: candidateIds.length,
    });
    return candidates.map((candidate) => ({
      ...candidate,
      screening_flag: "not_started",
      screening_status: null,
      screening_mode: null,
      screening_updated_at: null,
    }));
  }

  const latestByCandidate = new Map<string, ScreeningSnapshotRow>();
  for (const row of (data ?? []) as ScreeningSnapshotRow[]) {
    const candidateId = String(row.candidate_id ?? "");
    if (!candidateId) continue;
    const existing = latestByCandidate.get(candidateId);
    if (!existing) {
      latestByCandidate.set(candidateId, row);
      continue;
    }

    const rowTs = Date.parse(row.updated_at ?? row.created_at ?? "");
    const existingTs = Date.parse(existing.updated_at ?? existing.created_at ?? "");
    if (Number.isNaN(rowTs) && !Number.isNaN(existingTs)) continue;
    if (!Number.isNaN(rowTs) && Number.isNaN(existingTs)) {
      latestByCandidate.set(candidateId, row);
      continue;
    }
    if (rowTs > existingTs) latestByCandidate.set(candidateId, row);
  }

  return candidates.map((candidate) => {
    const candidateId = String(candidate.id ?? "");
    const latest = latestByCandidate.get(candidateId);
    const screeningStatus = latest?.status ?? null;
    const screeningMode = latest?.mode ?? null;
    const screeningUpdatedAt = latest?.updated_at ?? latest?.created_at ?? null;
    return {
      ...candidate,
      screening_flag: resolveCandidateScreeningFlag(screeningStatus),
      screening_status: screeningStatus,
      screening_mode: screeningMode,
      screening_updated_at: screeningUpdatedAt,
    };
  });
}

export const CandidateService = {
  async listMasked(supabase: SupabaseClient, params: CandidateListParams) {
    const { candidates, total, nextCursor } = await CandidateRepository.list(supabase, params);
    const flaggedCandidates = await attachCandidateScreeningFlags(
      supabase,
      candidates as Record<string, unknown>[],
      params.accessibleOrganisationIds,
    );

    const maskedCandidates = flaggedCandidates.map((c: Record<string, unknown>) =>
      maskCandidateForShortlist(c, false),
    );

    return {
      candidates: maskedCandidates,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
        nextCursor,
      },
    };
  },

  async getByUserId(supabase: SupabaseClient, userId: string) {
    return CandidateRepository.getByUserId(supabase, userId);
  },

  async eraseData(supabase: SupabaseClient, candidateId: string) {
    logger.info("Executing candidate data erasure", {
      candidate_id: candidateId,
    });

    const { error: careerErasureError } = await supabase
      .from("candidate_career_profiles")
      .delete()
      .eq("candidate_id", candidateId);
    if (careerErasureError) throw new Error("Could not erase career details");

    const { error: vouchError } = await supabase
      .from("vouches")
      .delete()
      .eq("candidate_id", candidateId);
    if (vouchError) throw new Error("Could not erase candidate vouches");

    const { error: scoreError } = await supabase
      .from("fit_scores")
      .update({
        summary: null,
        green_flags: null,
        amber_flags: null,
        red_flags: null,
      })
      .eq("candidate_id", candidateId);

    if (scoreError) throw new Error("Could not redact candidate scores");

    // Preserve CV references until deletion is confirmed; failures must remain retryable.
    const { data: cvRow, error: cvReadError } = await supabase
      .from("candidates")
      .select("resume_url, cv_url")
      .eq("id", candidateId)
      .maybeSingle();

    if (cvReadError) throw new Error("Could not load candidate CV references");

    const objects = new Map<string, Set<string>>();
    let unresolved = false;
    for (const url of [
      (cvRow as { resume_url?: string | null } | null)?.resume_url,
      (cvRow as { cv_url?: string | null } | null)?.cv_url,
    ]) {
      if (!url) continue;
      const resolved = resolveCvStorageObject({ fileUrl: url });
      if (!resolved) {
        unresolved = true;
        continue;
      }
      if (!objects.has(resolved.bucket)) objects.set(resolved.bucket, new Set());
      objects.get(resolved.bucket)!.add(resolved.path);
    }

    let cvDeleted = !unresolved;
    for (const [bucket, paths] of objects) {
      const wanted = [...paths];
      const store = supabase.storage.from(bucket);
      const { data: removed, error: storageErr } = await store.remove(wanted);
      // A prior attempt may have removed the file before a later DB write failed.
      // Accept an already absent object only after Storage confirms HTTP 404.
      let confirmed = !storageErr && (removed?.length ?? 0) >= wanted.length;
      if (!confirmed && !storageErr) {
        confirmed = true;
        for (const path of wanted) {
          try {
            const result = await store.exists(path);
            if (
              result.data !== false ||
              (result.error && Number((result.error as { status?: number }).status) !== 404)
            )
              confirmed = false;
          } catch {
            confirmed = false;
          }
        }
      }
      if (!confirmed) {
        logger.error("Candidate erasure: CV storage delete incomplete", {
          candidate_id: candidateId,
          bucket,
          requested: wanted.length,
          removed: removed?.length ?? 0,
          error: storageErr ? String(storageErr.message) : undefined,
        });
        cvDeleted = false;
      }
    }
    if (unresolved) {
      logger.error("Candidate erasure: a CV reference could not be resolved to a storage object", {
        candidate_id: candidateId,
      });
    }
    await CandidateRepository.eraseCandidate(supabase, candidateId, { clearCvUrls: cvDeleted });

    // Purge candidate PII; the shared job-keyed JD cache is outside this scope.
    const { error: cacheError } = await supabase
      .from("candidate_profile_cache")
      .delete()
      .eq("candidate_id", candidateId);
    if (cacheError) throw new Error("Could not erase candidate profile cache");
    const { error: extractionError } = await supabase
      .from("fitscore_extraction_log")
      .delete()
      .eq("candidate_id", candidateId);
    if (extractionError) throw new Error("Could not erase candidate extraction log");

    const { error: auditError } = await supabase.from("retention_deletions").insert({
      candidate_id: candidateId,
      deletion_reason: "erasure_request",
      data_deleted: {
        phone: true,
        email: true,
        name: true,
        cv: cvDeleted,
        linkedin: true,
        embedding: true,
        profile_cache: true,
        career_profile: true,
        extraction_log: true,
      },
    });

    if (auditError) throw new Error("Could not record candidate erasure");
    if (!cvDeleted) throw new Error("Candidate CV erasure incomplete; retry required");

    logger.info("Candidate data erasure completed", {
      candidate_id: candidateId,
    });
  },
};
