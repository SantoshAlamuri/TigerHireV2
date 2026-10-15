import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { sendTemplateMessage } from "@/lib/services/whatsapp";
import { getOrgDisplayName } from "@/lib/screening/org-whatsapp-screening";
import {
  getApprovedJdBase,
  getGatingQuestions,
  getSession,
  updateSession,
} from "@/lib/prescreen/repository";
import { schedulePrescreenLifecycle } from "@/lib/prescreen/schedule-lifecycle";
import { loadShortlistedCandidates } from "@/lib/prescreen/bulk-post-shortlist";

export type RenudgeTarget = {
  candidateId: string;
  name: string;
  answered: number;
};

export type RenudgeResult = {
  dryRun: boolean;
  totalQuestions: number;
  eligible: number;
  sent: number;
  failed: number;
  targets: RenudgeTarget[];
};

/**
 * Re-invite shortlisted candidates whose post-shortlist round timed out
 * (session complete) before they answered every question.
 *
 * Unlike forceResend, this NEVER deletes recorded answers or sessions: it sends
 * the approved `th_shortlisted` template (deliverable outside Meta's 24h reply
 * window), reopens the session as awaiting_consent, and reschedules the
 * reminder/timeout lifecycle. When the candidate replies, the inbound handler
 * resumes at their first unanswered question. Candidates who completed every
 * question or answered a knockout NO are never re-nudged.
 */
export async function renudgePostShortlistNonResponders(
  admin: SupabaseClient,
  params: {
    jobId: string;
    organisationId: string | null;
    dryRun?: boolean;
  },
): Promise<RenudgeResult> {
  const dryRun = params.dryRun ?? true;
  const { jobId } = params;

  const jdBase = await getApprovedJdBase(admin, jobId);
  if (!jdBase) throw new Error("Approve the Ideal Profile (JD base) before re-nudging.");
  const questions = await getGatingQuestions(admin, jdBase.id, "post_shortlist");
  if (questions.length === 0) throw new Error("No post-shortlist questions configured.");
  const questionIds = questions.map((q) => q.id);

  const companyName = params.organisationId
    ? await getOrgDisplayName(admin, params.organisationId)
    : "the hiring team";

  const candidates = await loadShortlistedCandidates(admin, jobId);

  const { data: respRows, error: respErr } = await admin
    .from("prescreen_responses")
    .select("candidate_id, passed")
    .eq("job_id", jobId)
    .in("question_id", questionIds);
  if (respErr) throw respErr;

  const answeredByCandidate = new Map<string, { answered: number; anyNo: boolean }>();
  for (const r of respRows ?? []) {
    const cid = r.candidate_id as string;
    const entry = answeredByCandidate.get(cid) ?? { answered: 0, anyNo: false };
    entry.answered += 1;
    if (r.passed === false) entry.anyNo = true;
    answeredByCandidate.set(cid, entry);
  }

  const targets = candidates.filter((c) => {
    if (!c.phone?.trim()) return false;
    // Candidate texted STOP — do-not-contact wins over any re-nudge.
    if (c.doNotCall) return false;
    // Candidate explicitly replied NO at the consent step — that's an opt-out
    // for this round, not a missed timeout; never re-invite them.
    if (c.sessionDeclinedAt) return false;
    // Only sessions that ran to timeout; open/stale sessions belong to the
    // normal send + forceResend path, no-session candidates to the normal send.
    if (c.sessionState !== "complete") return false;
    const entry = answeredByCandidate.get(c.candidateId);
    if (entry?.anyNo) return false;
    return (entry?.answered ?? 0) < questions.length;
  });

  const result: RenudgeResult = {
    dryRun,
    totalQuestions: questions.length,
    eligible: targets.length,
    sent: 0,
    failed: 0,
    targets: targets.map((t) => ({
      candidateId: t.candidateId,
      name: t.fullName,
      answered: answeredByCandidate.get(t.candidateId)?.answered ?? 0,
    })),
  };

  if (dryRun) return result;

  for (const c of targets) {
    const firstName = c.fullName.trim().split(/\s+/)[0] || "there";
    const send = await sendTemplateMessage({
      phoneNumber: c.phone as string,
      templateName: "th_shortlisted",
      languageCode: "en",
      bodyParams: [firstName, jdBase.roleTitle, companyName],
      applicationId: c.applicationId ?? undefined,
    });

    if (!send.success) {
      result.failed += 1;
      logger.warn("[post-shortlist-renudge] template send failed", {
        jobId,
        candidateId: c.candidateId,
        error: send.error,
      });
      continue;
    }

    const session = await getSession(admin, jobId, c.candidateId, "post_shortlist");
    const nowIso = new Date().toISOString();
    if (session) {
      await updateSession(admin, session.id, {
        state: "awaiting_consent",
        current_question_index: 0,
        questions_sent_at: nowIso,
        reminder_sent_at: null,
        completed_at: null,
      });
      await schedulePrescreenLifecycle({
        sessionId: session.id,
        jobId,
        candidateId: c.candidateId,
        organisationId: params.organisationId,
        jdBaseDocumentId: jdBase.id,
        channel: "whatsapp",
        phone: c.phone,
        questionsSentAtIso: nowIso,
      });
    }

    result.sent += 1;
    logger.info("[post-shortlist-renudge] re-invite sent", {
      jobId,
      candidateId: c.candidateId,
      answered: answeredByCandidate.get(c.candidateId)?.answered ?? 0,
    });
  }

  logger.info("[post-shortlist-renudge] finished", { jobId, ...result, targets: undefined });
  return result;
}
