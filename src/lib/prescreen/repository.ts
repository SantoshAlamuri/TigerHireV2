import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import type {
  GateStatus,
  PrescreenChannel,
  PrescreenQuestionRow,
  PrescreenSession,
  PrescreenSessionState,
  PrescreenStage,
} from "@/lib/prescreen/types";

const SESSION_COLUMNS =
  "id, application_id, job_id, candidate_id, channel, stage, state, current_question_index, questions_sent_at, reminder_sent_at, completed_at, declined_at, created_at, updated_at";

export async function getSession(
  admin: SupabaseClient,
  jobId: string,
  candidateId: string,
  stage: PrescreenStage = "apply",
): Promise<PrescreenSession | null> {
  const { data, error } = await admin
    .from("prescreen_sessions")
    .select(SESSION_COLUMNS)
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .eq("stage", stage)
    .maybeSingle();
  if (error) throw error;
  return (data as PrescreenSession | null) ?? null;
}

export async function getSessionById(
  admin: SupabaseClient,
  id: string,
): Promise<PrescreenSession | null> {
  const { data, error } = await admin
    .from("prescreen_sessions")
    .select(SESSION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as PrescreenSession | null) ?? null;
}

/** True when the candidate has at least one recorded answer for this session's stage questions. */
async function sessionHasRecordedAnswer(
  admin: SupabaseClient,
  session: PrescreenSession,
): Promise<boolean> {
  const { data: responses, error } = await admin
    .from("prescreen_responses")
    .select("question_id")
    .eq("job_id", session.job_id)
    .eq("candidate_id", session.candidate_id);
  if (error) throw error;
  const questionIds = (responses ?? []).map((r) => (r as { question_id: string }).question_id);
  if (questionIds.length === 0) return false;

  // Responses are per (job, candidate, question); scope to this session's stage so an
  // old apply-stage answer never marks a post-shortlist session as "mid-round".
  const { data: stageQuestions, error: qErr } = await admin
    .from("prescreen_questions")
    .select("id")
    .in("id", questionIds)
    .eq("ask_stage", session.stage);
  if (qErr) throw qErr;
  return (stageQuestions ?? []).length > 0;
}

/** job_id -> organisation_id for the given open sessions (best-effort; missing on error). */
async function resolveSessionOrgs(
  admin: SupabaseClient,
  sessions: PrescreenSession[],
): Promise<Map<string, string | null>> {
  const jobIds = [...new Set(sessions.map((s) => s.job_id).filter(Boolean))];
  const map = new Map<string, string | null>();
  if (jobIds.length === 0) return map;
  const { data, error } = await admin.from("jobs").select("id, organisation_id").in("id", jobIds);
  if (error) {
    logger.warn("prescreen_session_org_resolve_failed", { error: error.message });
    return map;
  }
  for (const row of (data ?? []) as Array<{ id: string; organisation_id: string | null }>) {
    map.set(row.id, row.organisation_id ?? null);
  }
  return map;
}

/**
 * Most recent still-open WhatsApp prescreen session for a candidate.
 * Completed sessions are terminal and excluded, so a late reply never reopens a gate.
 *
 * Multi-job tiebreak: inbound WhatsApp replies carry no job context, so when a
 * candidate has open sessions on several jobs we must pick the one the reply most
 * plausibly belongs to. A brand-new invite (questions_sent_at = now, awaiting_consent)
 * must NOT steal replies from a round the candidate is actively answering on another
 * job. Preference order:
 *   1. cross-org collision → scope to the org stamped on the WhatsApp session (opts.preferOrgId);
 *   2. newest session that is mid-questions (state awaiting_reply/reminded AND has
 *      >= 1 recorded answer for its stage) — the candidate is engaged in that round;
 *   3. otherwise the newest open session by questions_sent_at (previous behaviour).
 */
export async function getActiveWhatsappSession(
  admin: SupabaseClient,
  candidateId: string,
  opts?: { preferOrgId?: string | null },
): Promise<PrescreenSession | null> {
  const { data, error } = await admin
    .from("prescreen_sessions")
    .select(SESSION_COLUMNS)
    .eq("candidate_id", candidateId)
    .eq("channel", "whatsapp")
    .neq("state", "complete")
    .order("questions_sent_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  let sessions = (data ?? []) as PrescreenSession[];
  if (sessions.length <= 1) return sessions[0] ?? null;

  // Cross-org safety: an inbound reply carries no job/org context, so a candidate
  // with open gates in MULTIPLE orgs risks a reply (and the company name shown)
  // being attributed to the wrong tenant. Resolve each open gate's org; on a
  // genuine multi-org collision, log it and — when the engaging org is known
  // (stamped on the WhatsApp session at invite time) — scope the pick to it so the
  // reply cannot land in another org's gate.
  const orgByJob = await resolveSessionOrgs(admin, sessions);
  const distinctOrgs = new Set(
    sessions.map((s) => orgByJob.get(s.job_id)).filter((o): o is string => Boolean(o)),
  );
  if (distinctOrgs.size > 1) {
    logger.warn("prescreen_whatsapp_cross_org_collision", {
      candidate_id: candidateId,
      open_sessions: sessions.length,
      distinct_orgs: distinctOrgs.size,
      scoped_to_session_org: Boolean(opts?.preferOrgId),
    });
    if (opts?.preferOrgId) {
      const scoped = sessions.filter((s) => orgByJob.get(s.job_id) === opts.preferOrgId);
      if (scoped.length > 0) sessions = scoped;
    }
  }

  if (sessions.length === 1) return sessions[0];
  for (const session of sessions) {
    if (session.state !== "awaiting_reply" && session.state !== "reminded") continue;
    if (await sessionHasRecordedAnswer(admin, session)) return session;
  }
  return sessions[0];
}

/** Latest approved JD base for a job (highest version). Shared by router + inbound routing. */
export async function getApprovedJdBase(
  admin: SupabaseClient,
  jobId: string,
): Promise<{ id: string; roleTitle: string } | null> {
  const { data, error } = await admin
    .from("jd_base_documents")
    .select("id, role_title, version, approved_at")
    .eq("job_id", jobId)
    .not("approved_at", "is", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id as string, roleTitle: (data.role_title as string) || "this role" };
}

/** All recorded gating answers for a candidate+job (drives position + resolution). */
export async function getResponses(
  admin: SupabaseClient,
  jobId: string,
  candidateId: string,
): Promise<Array<{ question_id: string; passed: boolean }>> {
  const { data, error } = await admin
    .from("prescreen_responses")
    .select("question_id, passed")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    question_id: String((r as { question_id?: string }).question_id ?? ""),
    passed: (r as { passed?: boolean }).passed === true,
  }));
}

/** Create the session if absent; returns the existing or created row (idempotent on job+candidate). */
export async function ensureSession(
  admin: SupabaseClient,
  params: {
    jobId: string;
    candidateId: string;
    applicationId?: string | null;
    channel: PrescreenChannel;
    stage?: PrescreenStage;
  },
): Promise<PrescreenSession> {
  const stage = params.stage ?? "apply";
  const existing = await getSession(admin, params.jobId, params.candidateId, stage);
  if (existing) return existing;

  const { data, error } = await admin
    .from("prescreen_sessions")
    .insert({
      job_id: params.jobId,
      candidate_id: params.candidateId,
      application_id: params.applicationId ?? null,
      channel: params.channel,
      stage,
      state: "awaiting_reply",
    })
    .select(SESSION_COLUMNS)
    .single();

  if (error) {
    // Concurrent insert lost the race against the unique index -> re-read.
    const raced = await getSession(admin, params.jobId, params.candidateId, stage);
    if (raced) return raced;
    throw error;
  }
  return data as PrescreenSession;
}

export async function updateSession(
  admin: SupabaseClient,
  id: string,
  patch: Partial<{
    state: PrescreenSessionState;
    current_question_index: number;
    questions_sent_at: string | null;
    reminder_sent_at: string | null;
    completed_at: string | null;
    declined_at: string | null;
  }>,
): Promise<void> {
  const { error } = await admin
    .from("prescreen_sessions")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Set the application gate state (and optional unverified labels). */
export async function setApplicationGate(
  admin: SupabaseClient,
  params: {
    jobId: string;
    candidateId: string;
    gateStatus: GateStatus;
    unverifiedMustHaves?: string[] | null;
  },
): Promise<void> {
  const patch: Record<string, unknown> = { gate_status: params.gateStatus };
  if (params.unverifiedMustHaves !== undefined) {
    patch.unverified_must_haves = params.unverifiedMustHaves;
  }
  const { error } = await admin
    .from("applications")
    .update(patch)
    .eq("job_id", params.jobId)
    .eq("candidate_id", params.candidateId);
  if (error) {
    logger.error("[prescreen] setApplicationGate failed", {
      jobId: params.jobId,
      candidateId: params.candidateId,
      message: error.message,
    });
    throw error;
  }
}

/** Ordered gating questions for a JD Base (gating=true only), scoped to one ask stage. */
export async function getGatingQuestions(
  admin: SupabaseClient,
  jdBaseDocumentId: string,
  stage: PrescreenStage = "apply",
): Promise<PrescreenQuestionRow[]> {
  const { data, error } = await admin
    .from("prescreen_questions")
    .select(
      "id, jd_base_document_id, requirement_id, question_text, answer_type, options, gating, ask_stage",
    )
    .eq("jd_base_document_id", jdBaseDocumentId)
    .eq("gating", true)
    .eq("ask_stage", stage)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    options: Array.isArray(row.options) ? (row.options as string[]) : null,
  })) as PrescreenQuestionRow[];
}

/** Upsert a single answer (unique on candidate+job+question). */
export async function recordResponse(
  admin: SupabaseClient,
  params: {
    jobId: string;
    candidateId: string;
    questionId: string;
    answer: string;
    passed: boolean;
  },
): Promise<void> {
  const { error } = await admin.from("prescreen_responses").upsert(
    {
      job_id: params.jobId,
      candidate_id: params.candidateId,
      question_id: params.questionId,
      answer: params.answer,
      passed: params.passed,
      gate_status: params.passed ? "passed" : "failed",
    },
    { onConflict: "candidate_id,job_id,question_id" },
  );
  if (error) throw error;
}
