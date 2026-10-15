import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isJdBaseApproved } from "@/lib/fitscore/pending-jd-approval";
import {
  fetchJobTitleAndCompany,
  scoreWhatsAppJobForCandidate,
} from "@/lib/whatsapp/fitscore-routing";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { logger } from "@/lib/observability/logger";
import {
  ALERT_SUBSCRIPTION_MONTHS,
  FITSCORE_MIN_THRESHOLD,
  MAX_IMMEDIATE_MATCH_JOBS,
  MAX_IMMEDIATE_MATCHES_TO_SHOW,
} from "../constants";
import { withSessionCAS } from "../sessions";
import { isCandidateMenuEligibleJob, normalizeRoleFunctionKey } from "../candidate-menu-jobs";
import { addMonths, candidateForScore, toJobData } from "./helpers";

/**
 * Score the selected role + related roles and present the result to the candidate.
 * Extracted so it can run either directly (no screening questions) or after the
 * candidate completes the canonical screening Q&A over WhatsApp.
 */
export async function scoreAndPresentSelectedRole(params: {
  phone: string;
  candidateId: string;
  selected: { id: string; title: string; location: string; roleFunction: string | null };
  selectedJob: Record<string, unknown>;
  processingContext: Record<string, unknown>;
  sessionContext: Record<string, unknown>;
  qaStep: number;
  applyTitle: string;
  introMessage?: string | null;
}): Promise<void> {
  const {
    phone,
    candidateId,
    selected,
    selectedJob,
    processingContext,
    sessionContext,
    qaStep,
    applyTitle,
    introMessage,
  } = params;
  const supabase = createSupabaseAdmin();

  await withSessionCAS(phone, () => ({
    state: "preferences_complete",
    context: {
      ...processingContext,
      fit_score_eval_in_progress: true,
      fit_score_eval_started_at: new Date().toISOString(),
    },
    extras: { qa_step: 2 },
  }));
  if (introMessage !== null) {
    await sendWhatsAppMessage(
      phone,
      introMessage ?? `Got it — you've applied to *${applyTitle}*. Scoring your fit now.`,
    );
  }

  const { data: candidate } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", candidateId)
    .maybeSingle();
  if (!candidate) {
    await sendWhatsAppMessage(phone, "Could not load your profile. Please send your CV again.");
    await withSessionCAS(phone, () => ({
      state: "cv_requested",
      context: { ...sessionContext },
    }));
    return;
  }

  const candidatePayload = candidateForScore(candidate as Record<string, unknown>);
  const selectedJobData = toJobData(selectedJob);

  const firstName =
    (candidate.name ?? candidate.full_name ?? "there").toString().split(" ")[0] || "there";
  const jobContext = await fetchJobTitleAndCompany(supabase, selected.id);
  const jdApproved = await isJdBaseApproved(supabase, selected.id);

  let selectedOverall = 0;
  const selectedOutcome = await scoreWhatsAppJobForCandidate({
    supabase,
    jobId: selected.id,
    jobData: selectedJobData,
    candidateId,
    candidate: candidatePayload,
    applicationAck:
      !jdApproved && jobContext
        ? {
            phone,
            candidateName: firstName,
            jobTitle: jobContext.jobTitle,
            companyName: jobContext.companyName,
          }
        : undefined,
  });
  if (selectedOutcome.status === "scored") {
    selectedOverall = selectedOutcome.overallScore;
  } else if (selectedOutcome.status === "error") {
    logger.warn("Role guided flow: selected job scoring failed", {
      candidateId,
      jobId: selected.id,
      error: selectedOutcome.message,
    });
  } else if (selectedOutcome.status === "prescreen_gate_pending") {
    // Canonical/legacy gate is still holding scoring (e.g. answers not all in yet).
    await withSessionCAS(phone, () => ({
      state: "preferences_complete",
      context: processingContext,
      extras: { qa_step: 2 },
    }));
    await sendWhatsAppMessage(
      phone,
      "Thanks — I'll score your fit as soon as the screening questions are complete.",
    );
    return;
  } else if (selectedOutcome.status === "pending_jd_approval") {
    await withSessionCAS(phone, () => ({
      state: "active_alerts",
      context: processingContext,
      extras: {
        qa_step: qaStep,
        alerts_expires_at: addMonths(new Date(), ALERT_SUBSCRIPTION_MONTHS),
      },
    }));
    return;
  }

  let relatedQuery = supabase
    .from("jobs")
    .select("*, jd_base_documents!inner(id)")
    .eq("status", "open")
    .neq("id", selected.id)
    .order("updated_at", { ascending: false })
    .limit(MAX_IMMEDIATE_MATCH_JOBS);

  if (selected.roleFunction?.trim()) {
    relatedQuery = relatedQuery.ilike(
      "role_function",
      normalizeRoleFunctionKey(selected.roleFunction),
    );
  } else {
    relatedQuery = relatedQuery.ilike("title", `%${selected.title}%`);
  }

  const { data: relatedJobs } = await relatedQuery;
  const relatedStrong: Array<{ title: string; location: string; score: number }> = [];
  for (const job of (relatedJobs ?? []) as Array<Record<string, unknown>>) {
    if (!isCandidateMenuEligibleJob({ id: String(job.id ?? ""), title: job.title as string })) {
      continue;
    }
    const jobId = String(job.id ?? "");
    if (!jobId) continue;
    const relatedOutcome = await scoreWhatsAppJobForCandidate({
      supabase,
      jobId,
      jobData: toJobData(job),
      candidateId,
      candidate: candidatePayload,
    });
    if (relatedOutcome.status === "scored") {
      if (relatedOutcome.overallScore >= FITSCORE_MIN_THRESHOLD) {
        relatedStrong.push({
          title: String(job.title ?? "Role"),
          location: (job.location as string) || "—",
          score: relatedOutcome.overallScore,
        });
      }
    } else if (relatedOutcome.status === "error") {
      logger.warn("Role guided flow: related job scoring failed", {
        candidateId,
        jobId,
        error: relatedOutcome.message,
      });
    }
  }

  const selectedStrong = selectedOverall >= FITSCORE_MIN_THRESHOLD;
  const topRelated = relatedStrong
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_IMMEDIATE_MATCHES_TO_SHOW);

  const parts: string[] = [];
  parts.push(
    selectedStrong
      ? `Selected JD result: ${selected.title} — FitScore ${selectedOverall} (${selected.location}).`
      : `Selected JD result: ${selected.title} — FitScore ${selectedOverall} (${selected.location}). Not a strong match yet.`,
  );

  if (topRelated.length > 0) {
    parts.push("Other strong related roles:");
    for (let i = 0; i < topRelated.length; i += 1) {
      const r = topRelated[i];
      parts.push(`${i + 1}. ${r.title} — ${r.location} — FitScore ${r.score}`);
    }
  } else {
    parts.push("No other strong related roles right now. I will keep watching and alert you.");
  }
  parts.push(
    "You're all set for now. Reply STATUS for application updates, MATCHES for your roles, or send a new CV PDF anytime to refresh.",
  );

  await sendWhatsAppMessage(phone, parts.join("\n"));
  await withSessionCAS(phone, () => ({
    state: "active_alerts",
    context: {
      ...sessionContext,
      candidate_id: candidateId,
      selected_job_id: selected.id,
      selected_role_family: sessionContext?.selected_role_family,
    },
    extras: { qa_step: 2, alerts_expires_at: addMonths(new Date(), ALERT_SUBSCRIPTION_MONTHS) },
  }));
}
