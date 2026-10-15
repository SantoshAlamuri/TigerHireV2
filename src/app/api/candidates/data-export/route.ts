import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { writeAccessAuditEvent } from "@/lib/security/access-audit";
import {
  checkRateLimit,
  buildScopedRateLimitKey,
  getClientIpForRateLimit,
} from "@/lib/security/rate-limit";

// DSAR exports are expensive and PII-heavy; cap per requester to prevent
// scraping/enumeration of candidate data (PII-003). Scoped per user (not per
// candidate) so the cap bounds total exports regardless of candidateId.
const DSAR_EXPORT_LIMIT = 5;
const DSAR_EXPORT_WINDOW_SECS = 60;

type CandidateRow = {
  id: string;
  user_id: string | null;
  phone: string | null;
};

const CANDIDATE_SELECT_COLUMNS = `
  id, user_id, name, full_name, email, phone, resume_url, cv_url, cv_raw_text, cv_parsed_at,
  skills, experience_years, location, intent_score, profile_embedding, visibility, signal_sources,
  trust_score, ghost_risk_score, entry_path, availability, seniority_level, current_role,
  current_company, salary_expectation_min, salary_expectation_max, referred_by, linkedin_url,
  portfolio_url, github_url, employment_status, employer_company_id, resignation_declared_at,
  profile_unlocked_at, processing_status, erased_at, last_active_at, authenticity_signal,
  authenticity_confidence, authenticity_reasons, authenticity_score, authenticity_flags, created_at, updated_at
`;
const APPLICATION_SELECT_COLUMNS = `
  id, candidate_id, job_id, fit_score_id, interest, cover_note, status, viewed_at, created_at, updated_at,
  source, referral_link_id, direct_referrer_id, parent_referrer_id, current_ctc_lpa, expected_ctc_lpa,
  notice_period_days, offers_in_hand, available_from, relocation_willingness, app_close_reminder_7d_sent_at,
  app_close_reminder_24h_sent_at, stage_type, billing_ctc_required, offer_accepted_at, confidential_apply
`;
const RESUME_VERSION_SELECT_COLUMNS = `
  id, candidate_id, file_url, file_name, file_size, storage_path, is_default, label, uploaded_by, created_at
`;
const CONSENT_RECORD_SELECT_COLUMNS = `
  id, phone, candidate_id, consent_type, consent_given, consent_text, obtained_via, ip_address,
  whatsapp_message_id, created_at
`;
const ERASURE_REQUEST_SELECT_COLUMNS = `
  id, candidate_id, phone, requested_via, status, rejection_reason, completed_at, created_at
`;
const CANDIDATE_UNLOCK_SELECT_COLUMNS = `
  id, candidate_id, job_id, organisation_id, unlocked_by, created_at
`;

/**
 * GET /api/candidates/data-export
 * Candidate DSAR portability export (JSON).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const rl = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "candidates:data-export",
        userId: ctx.userId,
        ip: getClientIpForRateLimit(request),
      }),
      limit: DSAR_EXPORT_LIMIT,
      windowSecs: DSAR_EXPORT_WINDOW_SECS,
    });
    if (!rl.allowed) {
      return jsonError("Rate limit exceeded. Please wait before exporting again.", 429);
    }

    const supabase = await createSupabaseServerClient();
    const admin = createSupabaseAdmin();

    let candidate: CandidateRow | null = null;
    const candidateIdQuery = request.nextUrl.searchParams.get("candidateId");

    if (hasRole(ctx, "candidate_pro", "candidate_free")) {
      const { data } = await supabase
        .from("candidates")
        .select("id, user_id, phone")
        .eq("user_id", ctx.userId)
        .maybeSingle();
      candidate = (data as CandidateRow | null) ?? null;
    } else if (hasRole(ctx, "super_admin")) {
      if (!candidateIdQuery) {
        return jsonError("candidateId is required for super admin exports", 400);
      }
      const { data } = await admin
        .from("candidates")
        .select("id, user_id, phone")
        .eq("id", candidateIdQuery)
        .maybeSingle();
      candidate = (data as CandidateRow | null) ?? null;
    } else {
      return jsonError("Forbidden", 403);
    }

    if (!candidate) return jsonError("Candidate not found", 404);

    const consentPromise = candidate.phone
      ? admin
          .from("consent_records")
          .select(CONSENT_RECORD_SELECT_COLUMNS)
          .eq("phone", candidate.phone)
          .order("created_at")
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null });

    const [candidateRow, applications, resumes, consentRecords, erasureRequests, unlocks, career] =
      await Promise.all([
        admin
          .from("candidates")
          .select(CANDIDATE_SELECT_COLUMNS)
          .eq("id", candidate.id)
          .maybeSingle(),
        admin
          .from("applications")
          .select(APPLICATION_SELECT_COLUMNS)
          .eq("candidate_id", candidate.id)
          .order("created_at"),
        admin
          .from("resume_versions")
          .select(RESUME_VERSION_SELECT_COLUMNS)
          .eq("candidate_id", candidate.id)
          .order("created_at"),
        consentPromise,
        admin
          .from("erasure_requests")
          .select(ERASURE_REQUEST_SELECT_COLUMNS)
          .eq("candidate_id", candidate.id)
          .order("created_at"),
        admin
          .from("candidate_unlocks")
          .select(CANDIDATE_UNLOCK_SELECT_COLUMNS)
          .eq("candidate_id", candidate.id)
          .order("created_at"),
        admin
          .from("candidate_career_profiles")
          .select("document, updated_at")
          .eq("candidate_id", candidate.id)
          .maybeSingle(),
      ]);

    if (career.error) throw career.error;

    await writeAccessAuditEvent({
      userId: ctx.userId,
      candidateId: candidate.id,
      action: "view_pii",
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: request.headers.get("user-agent"),
      metadata: {
        route: "GET /api/candidates/data-export",
        requester_role: ctx.role,
      },
    });

    return jsonSuccess({
      exportedAt: new Date().toISOString(),
      candidate: candidateRow.data ?? null,
      applications: applications.data ?? [],
      resumeVersions: resumes.data ?? [],
      consentRecords: consentRecords.data ?? [],
      erasureRequests: erasureRequests.data ?? [],
      candidateUnlocks: unlocks.data ?? [],
      careerProfile: career.data ?? null,
    });
  } catch (err) {
    return handleApiError(err, "Failed to export candidate data", {
      route: "GET /api/candidates/data-export",
    });
  }
}
