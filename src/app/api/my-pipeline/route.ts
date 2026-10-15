import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { logger } from "@/lib/observability/logger";
import { computeSlaHealth } from "@/lib/pipeline/sla-status";
import { resolveStageEnteredAtIso, type StageTransitionRow } from "@/lib/pipeline/stage-entered-at";
import { env } from "@/lib/config/env";
import {
  isAgencyStageVisibleToCompany,
  isAgencyUploadedApplicationSource,
} from "@/lib/constants/agency-stages";

// `joined_at` is the day-90 referral anchor. It is absent on databases that
// have not taken the migration yet, which is what the LEGACY select below is
// for — the missing-column retry keeps those environments working rather than
// failing the whole pipeline read.
// `candidates.role_title` was in this select and exists on no database — not
// preview, not production. PostgREST rejected the whole select, the
// missing-column retry below swallowed it, and every request has been served by
// the LEGACY shape for as long as the column has been named here. That shape has
// no `phone`, which is why the pipeline shows "Phone not available" on every
// card. Dropping the phantom column restores phone and lets joined_at through.
const PIPELINE_CANDIDATE_SELECT =
  "id, job_id, candidate_id, stage_id, status, agency_stage, interview_scheduled_at, interview_outcome, recruiter_rating, created_at, joined_at, candidates(id, name, email, phone, skills, location, processing_status, experience_years, current_role)";
const PIPELINE_CANDIDATE_SELECT_LEGACY =
  "id, job_id, candidate_id, stage_id, status, agency_stage, interview_scheduled_at, interview_outcome, recruiter_rating, created_at, candidates(id, name, email, skills, location, processing_status, experience_years, current_role)";

function isMissingColumnError(err: unknown): boolean {
  const message =
    err && typeof err === "object" && "message" in err && typeof err.message === "string"
      ? err.message
      : String(err ?? "");
  return message.includes("column") && message.includes("does not exist");
}

/**
 * GET /api/my-pipeline
 * Returns pipeline candidates across all jobs owned by the current hiring manager.
 * Also works for recruiters (shows org-wide pipeline).
 *
 * Not Redis-cached: FitScores update frequently; a short TTL still produced stale “No score”
 * cards until expiry or manual invalidation. Always compute from DB.
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!hasRole(ctx, "hiring_manager", "recruiter", "leadership", "agency", "super_admin")) {
      return jsonError("Forbidden", 403);
    }

    const admin = createSupabaseAdmin();

    let jobQuery = admin
      .from("jobs")
      .select(
        "id, title, status, hiring_manager_id, organisation_id, compensation_min, compensation_max, role_function",
      );

    if (hasRole(ctx, "hiring_manager")) {
      jobQuery = jobQuery.eq("hiring_manager_id", ctx.userId);
    } else if (hasRole(ctx, "agency") && ctx.organisationId) {
      const { data: links } = await admin
        .from("agency_clients")
        .select("client_organisation_id")
        .eq("agency_organisation_id", ctx.organisationId);
      const clientIds = (links ?? []).map(
        (r: { client_organisation_id: string }) => r.client_organisation_id,
      );
      // Include agency's own org so pipeline shows candidates for own-org jobs too
      const organisationIds = [...new Set([ctx.organisationId, ...clientIds])] as string[];
      jobQuery = jobQuery.in("organisation_id", organisationIds);
    } else if (ctx.organisationId) {
      jobQuery = jobQuery.eq("organisation_id", ctx.organisationId);
    }

    const { data: jobs } = await jobQuery;
    if (!jobs || jobs.length === 0) return jsonSuccess({ pipeline: [] });

    const jobIds = jobs.map((j: Record<string, unknown>) => j.id as string);
    const jobMap = new Map(jobs.map((j: Record<string, unknown>) => [j.id as string, j]));

    const pipelineFull = await admin
      .from("pipeline_candidates")
      .select(PIPELINE_CANDIDATE_SELECT)
      .in("job_id", jobIds)
      .order("created_at", { ascending: false });

    let pipelineCandidates = (pipelineFull.data ?? null) as Record<string, unknown>[] | null;
    if (pipelineFull.error && isMissingColumnError(pipelineFull.error)) {
      // Named, because this path silently drops columns the UI depends on —
      // joined_at among them, which turns the day-90 field into a control that
      // never shows a saved value. A 200 with quietly missing fields is the
      // hardest kind of failure to notice.
      logger.warn("my_pipeline_select_degraded_missing_column", {
        error: pipelineFull.error.message,
      });
      const pipelineLegacy = await admin
        .from("pipeline_candidates")
        .select(PIPELINE_CANDIDATE_SELECT_LEGACY)
        .in("job_id", jobIds)
        .order("created_at", { ascending: false });
      if (pipelineLegacy.error) {
        throw pipelineLegacy.error;
      }
      pipelineCandidates = (pipelineLegacy.data ?? null) as Record<string, unknown>[] | null;
    } else if (pipelineFull.error) {
      throw pipelineFull.error;
    }

    if (!pipelineCandidates || pipelineCandidates.length === 0) {
      return jsonSuccess({ pipeline: [] });
    }

    const pcIds = pipelineCandidates.map((pc: Record<string, unknown>) => pc.id as string);
    const { data: stageRowsForJobs } = await admin
      .from("pipeline_stages")
      .select("id, job_id, stage_name, stage_order")
      .in("job_id", jobIds)
      .order("stage_order", { ascending: true });

    const stageIds = [
      ...new Set(
        pipelineCandidates
          .map((pc: Record<string, unknown>) => pc.stage_id as string | null)
          .filter(Boolean),
      ),
    ] as string[];
    const candidateIds = [
      ...new Set(
        pipelineCandidates.map((pc: Record<string, unknown>) => pc.candidate_id as string),
      ),
    ];
    const orgIds = [
      ...new Set(
        jobs
          .map((j: Record<string, unknown>) => j.organisation_id as string | null)
          .filter(Boolean),
      ),
    ] as string[];

    const pairKeys = new Set(
      pipelineCandidates.map(
        (pc: Record<string, unknown>) => `${pc.job_id as string}:${pc.candidate_id as string}`,
      ),
    );

    const [approvalsRes, stagesRes, scoresRes, orgsRes, appsRes, vouchesRes, transitionsRes] =
      await Promise.all([
        admin
          .from("shortlist_approvals")
          .select("pipeline_candidate_id, approver_role, decision, decided_at")
          .in("pipeline_candidate_id", pcIds.length > 0 ? pcIds : ["__none__"]),
        stageIds.length > 0
          ? admin
              .from("pipeline_stages")
              .select("id, stage_name, stage_order, sla_days, stage_type")
              .in("id", stageIds)
          : Promise.resolve({ data: null }),
        jobIds.length > 0 && candidateIds.length > 0
          ? admin
              .from("fit_scores")
              .select(
                "job_id, candidate_id, overall_score, primary_score, shadow_score, signal_score, grade_based_score, scoring_version, recruiter_selected, is_test_run, one_line_summary, key_strengths, key_gaps, confidence, band, scoring_status, green_flags, red_flags, market_percentile, ideal_match_pct, criteria_breakdown, matched_keywords, evidence_snapshot, evidence_json, provenance_hash",
              )
              .in("job_id", jobIds)
              .in("candidate_id", candidateIds)
              .is("superseded_at", null)
              .or("is_test_run.eq.false,is_test_run.is.null")
          : Promise.resolve({ data: null, error: null }),
        orgIds.length > 0
          ? admin.from("organisations").select("id, name").in("id", orgIds)
          : Promise.resolve({ data: null }),
        jobIds.length > 0 && candidateIds.length > 0
          ? admin
              .from("applications")
              .select(
                "id, job_id, candidate_id, source, direct_referrer_id, parent_referrer_id, referral_link_id, created_at, updated_at, stage_type, billing_ctc_required, current_ctc_lpa, expected_ctc_lpa, notice_period_days, offers_in_hand, available_from, relocation_willingness",
              )
              .in("job_id", jobIds)
              .in("candidate_id", candidateIds)
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        candidateIds.length > 0
          ? admin
              .from("vouches")
              .select("candidate_id, voucher_name, relationship_type")
              .in("candidate_id", candidateIds)
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        pcIds.length > 0
          ? admin
              .from("pipeline_stage_transitions")
              .select("pipeline_candidate_id, to_stage, entered_at")
              .in("pipeline_candidate_id", pcIds)
          : Promise.resolve({ data: [] as StageTransitionRow[] }),
      ]);

    const stageTransitions = (transitionsRes.data ?? []) as StageTransitionRow[];

    const approvals = approvalsRes.data;
    const approvalMap = new Map<string, Record<string, unknown>[]>();
    for (const a of approvals ?? []) {
      const pcId = a.pipeline_candidate_id as string;
      if (!approvalMap.has(pcId)) approvalMap.set(pcId, []);
      approvalMap.get(pcId)!.push(a);
    }

    const stages = stagesRes.data;
    const stageMap = new Map<string, string>();
    const stageTypeMap = new Map<string, string | null>();
    const stageSlaMap = new Map<string, number | null>();
    const stageOrderMap = new Map<string, number | null>();
    if (stages) {
      for (const s of stages) {
        stageMap.set(s.id as string, s.stage_name as string);
        stageTypeMap.set(s.id as string, (s.stage_type as string | null) ?? null);
        stageSlaMap.set(s.id as string, (s.sla_days as number | null) ?? null);
        stageOrderMap.set(s.id as string, (s.stage_order as number | null) ?? null);
      }
    }

    const scoresErr =
      scoresRes && typeof scoresRes === "object" && "error" in scoresRes
        ? (scoresRes as { error: { message?: string; code?: string } | null }).error
        : null;
    if (scoresErr) {
      logger.error("my-pipeline: fit_scores query failed (scores hidden for all cards)", {
        message: scoresErr.message,
        code: scoresErr.code,
      });
    }

    // We explicitly scope to non-test active rows (superseded_at IS NULL), so each
    // job+candidate pair should resolve to at most one production score row.
    const scoreMap = new Map<
      string,
      {
        overall_score: number;
        primary_score?: number | null;
        shadow_score?: number | null;
        signal_score?: number | null;
        grade_based_score?: number | null;
        scoring_version?: number | null;
        recruiter_selected?: string | null;
        one_line_summary?: string | null;
        key_strengths?: string[] | null;
        key_gaps?: string[] | null;
        confidence?: string | null;
        band?: string | null;
        scoring_status?: "scored" | "deferred" | "failed" | null;
        green_flags?: string[] | null;
        red_flags?: string[] | null;
        market_percentile?: number | null;
        ideal_match_pct?: number | null;
        criteria_breakdown?: Record<string, unknown>[] | null;
        matched_keywords?: string[] | null;
        evidence_snapshot?: Record<string, unknown> | null;
        evidence_json?: Record<string, unknown> | null;
        provenance_hash?: string | null;
      }
    >();
    for (const row of (scoresRes.data ?? []) as Record<string, unknown>[]) {
      const key = `${row.job_id}:${row.candidate_id}`;
      scoreMap.set(key, {
        overall_score: row.overall_score as number,
        primary_score: (row.primary_score as number | null) ?? null,
        shadow_score: (row.shadow_score as number | null) ?? null,
        signal_score: (row.signal_score as number | null) ?? null,
        grade_based_score: (row.grade_based_score as number | null) ?? null,
        scoring_version: (row.scoring_version as number | null) ?? 1,
        recruiter_selected: (row.recruiter_selected as string | null) ?? null,
        one_line_summary: (row.one_line_summary as string | null) ?? null,
        key_strengths: (row.key_strengths as string[] | null) ?? null,
        key_gaps: (row.key_gaps as string[] | null) ?? null,
        confidence: (row.confidence as string | null) ?? null,
        band: (row.band as string | null) ?? null,
        scoring_status:
          (row.scoring_status as "scored" | "deferred" | "failed" | null | undefined) ?? null,
        green_flags: (row.green_flags as string[] | null) ?? null,
        red_flags: (row.red_flags as string[] | null) ?? null,
        market_percentile: (row.market_percentile as number | null) ?? null,
        ideal_match_pct: (row.ideal_match_pct as number | null) ?? null,
        criteria_breakdown: (row.criteria_breakdown as Record<string, unknown>[] | null) ?? null,
        matched_keywords: (row.matched_keywords as string[] | null) ?? null,
        evidence_snapshot: (row.evidence_snapshot as Record<string, unknown> | null) ?? null,
        evidence_json: (row.evidence_json as Record<string, unknown> | null) ?? null,
        provenance_hash: (row.provenance_hash as string | null) ?? null,
      });
    }

    const orgs = orgsRes.data;
    const orgNameMap = new Map<string, string>();
    if (orgs) {
      for (const o of orgs) {
        orgNameMap.set(o.id as string, o.name as string);
      }
    }

    const appMap = new Map<
      string,
      {
        application_id: string;
        source: string;
        direct_referrer_id: string | null;
        parent_referrer_id: string | null;
        referral_link_id: string | null;
        applied_at: string | null;
        updated_at: string | null;
        stage_type: string | null;
        billing_ctc_required: boolean;
        current_ctc_lpa: number | null;
        expected_ctc_lpa: number | null;
        notice_period_days: number | null;
        offers_in_hand: number | null;
        available_from: string | null;
        relocation_willingness: string | null;
      }
    >();

    function referralSignalScore(row: {
      application_id: string;
      source: string;
      direct_referrer_id: string | null;
      parent_referrer_id: string | null;
      referral_link_id: string | null;
    }): number {
      const source = row.source.toLowerCase();
      let score = 0;
      if (row.direct_referrer_id) score += 100;
      if (row.parent_referrer_id) score += 50;
      if (row.referral_link_id) score += 25;
      if (source.includes("referr")) score += 15;
      return score;
    }

    for (const row of (appsRes.data ?? []) as Record<string, unknown>[]) {
      const key = `${row.job_id as string}:${row.candidate_id as string}`;
      if (!pairKeys.has(key)) continue;
      const next = {
        application_id: row.id as string,
        source: (row.source as string) ?? "direct",
        direct_referrer_id: (row.direct_referrer_id as string | null) ?? null,
        parent_referrer_id: (row.parent_referrer_id as string | null) ?? null,
        referral_link_id: (row.referral_link_id as string | null) ?? null,
        // applications has no `applied_at`; the row is selected as created_at.
        applied_at: (row.created_at as string | null) ?? null,
        updated_at: (row.updated_at as string | null) ?? null,
        stage_type: (row.stage_type as string | null) ?? null,
        billing_ctc_required: Boolean(row.billing_ctc_required),
        current_ctc_lpa: (row.current_ctc_lpa as number | null) ?? null,
        expected_ctc_lpa: (row.expected_ctc_lpa as number | null) ?? null,
        notice_period_days: (row.notice_period_days as number | null) ?? null,
        offers_in_hand: (row.offers_in_hand as number | null) ?? null,
        available_from: (row.available_from as string | null) ?? null,
        relocation_willingness: (row.relocation_willingness as string | null) ?? null,
      };

      const prev = appMap.get(key);
      if (!prev) {
        appMap.set(key, next);
        continue;
      }

      const prevScore = referralSignalScore(prev);
      const nextScore = referralSignalScore(next);
      if (nextScore > prevScore) {
        appMap.set(key, next);
        continue;
      }
      if (nextScore < prevScore) continue;

      const prevTs = prev.applied_at ? Date.parse(prev.applied_at) : 0;
      const nextTs = next.applied_at ? Date.parse(next.applied_at) : 0;
      if (nextTs >= prevTs) appMap.set(key, next);
    }

    const hidePreShareAgencyFromCompany =
      hasRole(ctx, "hiring_manager", "recruiter", "leadership") &&
      !hasRole(ctx, "agency", "super_admin");

    if (hidePreShareAgencyFromCompany) {
      pipelineCandidates = pipelineCandidates.filter((pc: Record<string, unknown>) => {
        const appKey = `${pc.job_id as string}:${pc.candidate_id as string}`;
        const app = appMap.get(appKey);
        if (!app || !isAgencyUploadedApplicationSource(app.source)) {
          return true;
        }
        return isAgencyStageVisibleToCompany((pc.agency_stage as string | null) ?? null);
      });
    }

    const directReferrerIds = [
      ...new Set(
        [...appMap.values()]
          .map((a) => a.direct_referrer_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const parentReferrerIds = [
      ...new Set(
        [...appMap.values()]
          .map((a) => a.parent_referrer_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const directReferrerLookup = new Map<
      string,
      { name: string; type: string; org_verified: boolean; verified_org_id: string | null }
    >();
    const parentReferrerLookup = new Map<string, { name: string; type: string }>();

    const [directRefRes, parentRefRes] = await Promise.all([
      directReferrerIds.length > 0
        ? admin
            .from("referrers")
            .select("id, name, type, org_verified, verified_org_id")
            .in("id", directReferrerIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      parentReferrerIds.length > 0
        ? admin.from("referrers").select("id, name, type").in("id", parentReferrerIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ]);

    const verifiedOrgIds = [
      ...new Set(
        (directRefRes.data ?? [])
          .map((r) => (r.verified_org_id as string | null) ?? null)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const verifiedOrgRes =
      verifiedOrgIds.length > 0
        ? await admin.from("organisations").select("id, name").in("id", verifiedOrgIds)
        : { data: [] as Record<string, unknown>[] };
    const verifiedOrgNameMap = new Map<string, string>();
    for (const org of verifiedOrgRes.data ?? []) {
      verifiedOrgNameMap.set(org.id as string, org.name as string);
    }

    for (const r of directRefRes.data ?? []) {
      const verifiedOrgId = (r.verified_org_id as string | null) ?? null;
      directReferrerLookup.set(r.id as string, {
        name: r.name as string,
        type: r.type as string,
        org_verified: Boolean(r.org_verified),
        verified_org_id: verifiedOrgId,
      });
    }
    for (const r of parentRefRes.data ?? []) {
      parentReferrerLookup.set(r.id as string, {
        name: r.name as string,
        type: r.type as string,
      });
    }

    const vouchCountMap = new Map<string, number>();
    const vouchesByCandidate = new Map<
      string,
      Array<{ voucher_name: string | null; relationship_type: string | null }>
    >();
    for (const v of vouchesRes.data ?? []) {
      const row = v as {
        candidate_id: string;
        voucher_name?: string | null;
        relationship_type?: string | null;
      };
      const cid = row.candidate_id;
      vouchCountMap.set(cid, (vouchCountMap.get(cid) ?? 0) + 1);
      const list = vouchesByCandidate.get(cid) ?? [];
      list.push({
        voucher_name: row.voucher_name ?? null,
        relationship_type: row.relationship_type ?? null,
      });
      vouchesByCandidate.set(cid, list);
    }

    const viewerIsAgency = hasRole(ctx, "agency");
    const viewerIsSuperAdmin = hasRole(ctx, "super_admin");
    const filterPreShareAgencyRows = !viewerIsAgency && !viewerIsSuperAdmin;

    const pipeline = pipelineCandidates
      .filter((pc: Record<string, unknown>) => {
        if (!filterPreShareAgencyRows) return true;
        const appKey = `${pc.job_id as string}:${pc.candidate_id as string}`;
        const source = appMap.get(appKey)?.source ?? "direct";
        if (!isAgencyUploadedApplicationSource(source)) return true;
        return isAgencyStageVisibleToCompany(pc.agency_stage as string | null | undefined);
      })
      .map((pc: Record<string, unknown>) => {
        const job = jobMap.get(pc.job_id as string);
        const jobRecord = job as Record<string, unknown> | undefined;
        const pcApprovals = approvalMap.get(pc.id as string) ?? [];
        const scoreKey = `${pc.job_id}:${pc.candidate_id}`;
        const scoreRow = scoreMap.get(scoreKey);
        const overallScore = scoreRow?.overall_score ?? null;
        const orgId = jobRecord?.organisation_id as string | null;
        const isV2 = (scoreRow?.scoring_version ?? 1) >= 2;
        const confidence = env.ffConfidenceBand ? (scoreRow?.confidence ?? null) : null;
        const evidenceSnapshot = env.ffVerdictCvEvidence
          ? ((scoreRow?.evidence_snapshot ?? scoreRow?.evidence_json) as Record<
              string,
              unknown
            > | null)
          : null;
        const primaryScore = isV2
          ? null
          : (scoreRow?.primary_score ??
            (scoreRow?.signal_score != null && scoreRow?.grade_based_score != null
              ? Math.round(0.2 * scoreRow.signal_score + 0.8 * scoreRow.grade_based_score)
              : null));
        // v2 hybrid persists shadow_score (fit/market/ideal blend); keep legacy blend for v1 only.
        const shadowScore = isV2
          ? ((scoreRow?.shadow_score as number | null | undefined) ?? null)
          : (scoreRow?.shadow_score ??
            (scoreRow?.signal_score != null && scoreRow?.grade_based_score != null
              ? Math.round(0.4 * scoreRow.signal_score + 0.6 * scoreRow.grade_based_score)
              : null));

        const appKey = `${pc.job_id as string}:${pc.candidate_id as string}`;
        const appRow = appMap.get(appKey);
        const sid = pc.stage_id as string | null;
        const slaDaysForStage = sid ? (stageSlaMap.get(sid) ?? null) : null;
        const currentStageName = sid ? (stageMap.get(sid) ?? null) : null;
        const stageEnteredAt = resolveStageEnteredAtIso({
          pipelineCandidateId: pc.id as string,
          currentStageName,
          transitions: stageTransitions,
          applicationAppliedAt: appRow?.applied_at ?? null,
          pipelineCandidateCreatedAt: (pc.created_at as string | null) ?? null,
        });
        const sla = computeSlaHealth(stageEnteredAt, slaDaysForStage);
        const source = appRow?.source ?? "direct";
        const directRefId = appRow?.direct_referrer_id ?? null;
        const parentRefId = appRow?.parent_referrer_id ?? null;
        const directRef = directRefId ? directReferrerLookup.get(directRefId) : undefined;
        const parentRef = parentRefId ? parentReferrerLookup.get(parentRefId) : undefined;

        return {
          ...pc,
          jobTitle: jobRecord?.title ?? "Unknown",
          jobOrganisationId: orgId,
          jobOrganisationName: orgId ? (orgNameMap.get(orgId) ?? null) : null,
          jobCompensationMin: jobRecord?.compensation_min ?? null,
          jobCompensationMax: jobRecord?.compensation_max ?? null,
          jobRoleFunction: jobRecord?.role_function ?? null,
          stageName: stageMap.get(pc.stage_id as string) ?? null,
          stageOrder:
            pc.stage_id != null ? (stageOrderMap.get(pc.stage_id as string) ?? null) : null,
          stageType: stageTypeMap.get(pc.stage_id as string) ?? null,
          approvals: pcApprovals,
          overallScore,
          primaryScore: primaryScore ?? undefined,
          shadowScore: shadowScore ?? undefined,
          recruiterSelected: scoreRow?.recruiter_selected ?? undefined,
          oneLineSummary: scoreRow?.one_line_summary ?? null,
          keyStrengths: scoreRow?.key_strengths ?? null,
          keyGaps: scoreRow?.key_gaps ?? null,
          confidence,
          band: scoreRow?.band ?? null,
          scoring_status: scoreRow?.scoring_status ?? null,
          greenFlags: scoreRow?.green_flags ?? null,
          redFlags: scoreRow?.red_flags ?? null,
          marketScore: scoreRow?.market_percentile ?? null,
          idealMatch: scoreRow?.ideal_match_pct ?? null,
          criteriaBreakdown: scoreRow?.criteria_breakdown ?? null,
          matchedKeywords: scoreRow?.matched_keywords ?? null,
          evidenceSnapshot,
          provenanceHash: scoreRow?.provenance_hash ?? null,
          source,
          referrer_id: directRefId,
          application_id: appRow?.application_id ?? null,
          referrer_name: directRef?.name ?? null,
          referrer_type: directRef?.type ?? null,
          referrer_org_verified: directRef?.org_verified ?? false,
          referrer_verified_org_name:
            directRef?.verified_org_id != null
              ? (verifiedOrgNameMap.get(directRef.verified_org_id) ?? null)
              : null,
          parent_referrer_name: parentRef?.name ?? null,
          vouch_count: vouchCountMap.get(pc.candidate_id as string) ?? 0,
          vouches: vouchesByCandidate.get(pc.candidate_id as string) ?? [],
          currentCtcLpa: appRow?.current_ctc_lpa ?? null,
          expectedCtcLpa: appRow?.expected_ctc_lpa ?? null,
          noticePeriodDays: appRow?.notice_period_days ?? null,
          offersInHand: appRow?.offers_in_hand ?? null,
          availableFrom: appRow?.available_from ?? null,
          relocationWillingness: appRow?.relocation_willingness ?? null,
          sla_health: sla.health,
          sla_days_in_stage: sla.daysInStage,
          sla_overdue_days: sla.overdueDays,
          billing_ctc_required: appRow?.billing_ctc_required ?? false,
        };
      });

    return jsonSuccess({
      pipeline,
      stageCatalog: (stageRowsForJobs ?? [])
        .map((row) => ({
          id: String(row.id ?? ""),
          job_id: String(row.job_id ?? ""),
          stage_name: String(row.stage_name ?? "").trim(),
          stage_order: Number(row.stage_order ?? Number.MAX_SAFE_INTEGER),
        }))
        .filter((row) => row.id.length > 0 && row.job_id.length > 0 && row.stage_name.length > 0)
        .sort((a, b) => a.stage_order - b.stage_order),
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch pipeline", {
      route: "GET /api/my-pipeline",
    });
  }
}
