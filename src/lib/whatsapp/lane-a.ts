import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { JobData } from "@/lib/fitscore/types";
import { isJdBaseApproved } from "@/lib/fitscore/pending-jd-approval";
import {
  fetchJobTitleAndCompany,
  scoreWhatsAppJobForCandidate,
} from "@/lib/whatsapp/fitscore-routing";
import {
  sendThJobMatchResult,
  sendThJobNoMatch,
  sendWhatsAppMessage,
} from "@/lib/services/whatsapp";
import { logger } from "@/lib/observability/logger";
import { FITSCORE_MIN_THRESHOLD } from "./constants";
import { withSessionCAS } from "./sessions";
import type { ScoutAgentInput } from "@/lib/agents/scout";
import { runWhatsAppCvIngest } from "@/lib/agents/scout";
import { triggerVerifyAgent } from "@/lib/agents/verify";

async function sendLaneANoMatchWithFallback(params: {
  phone: string;
  name: string;
  title: string;
}): Promise<void> {
  const result = await sendThJobNoMatch(params);
  if (result.success) return;
  logger.warn("Lane A: th_job_no_match failed, falling back to text", {
    phone: params.phone,
    error: result.error,
  });
  await sendWhatsAppMessage(
    params.phone,
    `Thanks ${params.name}. You are not a strong match for "${params.title}" right now. We'll alert you when we find better-fit roles.`,
  );
}

async function sendLaneAMatchWithFallback(params: {
  phone: string;
  name: string;
  title: string;
  location: string;
  score: number;
  verdict: string;
}): Promise<void> {
  const result = await sendThJobMatchResult(params);
  if (result.success) return;
  logger.warn("Lane A: th_job_match_result failed, falling back to text", {
    phone: params.phone,
    error: result.error,
  });
  await sendWhatsAppMessage(
    params.phone,
    `Good news ${params.name}! You match "${params.title}" in ${params.location} with FitScore ${params.score}. ${params.verdict}`,
  );
}

/**
 * Lane A: CV + `job_id` in session context — score only that job, no bulk Scout.
 */
export async function handleLaneASingleJobScore(
  input: ScoutAgentInput,
  jobId: string,
): Promise<void> {
  const supabase = createSupabaseAdmin();

  const ingested = await runWhatsAppCvIngest(input);
  if (!ingested) {
    logger.warn("Lane A: CV ingest failed", { job_id: jobId });
    await sendWhatsAppMessage(
      input.phone,
      "Sorry, we couldn't read your CV. Please send it again as a PDF.",
    );
    await withSessionCAS(input.phone, () => ({
      state: "cv_requested",
      context: {
        ...input.session_context,
        job_id: jobId,
      },
    }));
    return;
  }

  const { candidateId, candidate } = ingested;

  triggerVerifyAgent(candidateId).catch((err) => {
    logger.warn("Lane A: verify agent failed", {
      candidate_id: candidateId,
      error: String(err),
    });
  });

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("status", "open")
    .maybeSingle();

  if (jobErr || !job) {
    await sendLaneANoMatchWithFallback({
      phone: input.phone,
      name: ((candidate.name ?? candidate.full_name) as string)?.split(" ")[0] || "there",
      title: "this role",
    });
    return;
  }

  const jobData: JobData = {
    id: job.id,
    title: String(job.title ?? ""),
    description: String(job.description ?? ""),
    location: (job.location as string) ?? null,
    status: String(job.status ?? "open"),
    compensation_min: job.compensation_min as number | null,
    compensation_max: job.compensation_max as number | null,
    organisation_id: String(job.organisation_id ?? ""),
  };

  const candidateForScore = {
    id: candidate.id as string,
    name: (candidate.name ?? candidate.full_name) as string | null,
    skills: (candidate.skills as string[]) ?? [],
    experience_years: candidate.experience_years as number | null,
    location: candidate.location as string | null,
    intent_score: null,
    resume_url: candidate.resume_url as string | null,
    updated_at: candidate.updated_at as string | null,
  };

  const firstName = ((candidate.name ?? candidate.full_name) as string)?.split(" ")[0] || "there";
  const title = String(job.title ?? "Role");
  const loc = (job.location as string) || "—";
  const jdApproved = await isJdBaseApproved(supabase, jobId);
  const jobContext = await fetchJobTitleAndCompany(supabase, jobId);

  if (jdApproved) {
    await sendWhatsAppMessage(
      input.phone,
      "Scoring your profile against the role now — this takes about 60 seconds. I'll message you the moment it's ready.",
    );
  }

  const scoreOutcome = await scoreWhatsAppJobForCandidate({
    supabase,
    jobId,
    jobData,
    candidateId,
    candidate: candidateForScore,
    applicationAck:
      !jdApproved && jobContext
        ? {
            phone: input.phone,
            candidateName: firstName,
            jobTitle: jobContext.jobTitle,
            companyName: jobContext.companyName,
          }
        : undefined,
  });

  if (scoreOutcome.status === "pending_jd_approval") {
    await withSessionCAS(input.phone, () => ({
      state: "scored",
      context: {
        ...input.session_context,
        candidate_id: candidateId,
        job_id: jobId,
        source: "campaign",
      },
    }));
    return;
  }

  if (scoreOutcome.status === "prescreen_gate_pending") {
    await withSessionCAS(input.phone, () => ({
      state: "scored",
      context: {
        ...input.session_context,
        candidate_id: candidateId,
        job_id: jobId,
        source: "campaign",
      },
    }));
    return;
  }

  if (scoreOutcome.status === "error") {
    await sendLaneANoMatchWithFallback({
      phone: input.phone,
      name: firstName,
      title,
    });
    return;
  }

  const scoreValue = scoreOutcome.overallScore;
  const verdictBand = scoreOutcome.band ?? "See TigerHire for details.";

  if (scoreValue >= FITSCORE_MIN_THRESHOLD) {
    await sendLaneAMatchWithFallback({
      phone: input.phone,
      name: firstName,
      title,
      location: loc,
      score: scoreValue,
      verdict: verdictBand.slice(0, 120),
    });
  } else {
    await sendLaneANoMatchWithFallback({
      phone: input.phone,
      name: firstName,
      title,
    });
  }

  await withSessionCAS(input.phone, () => ({
    state: "scored",
    context: {
      ...input.session_context,
      candidate_id: candidateId,
      job_id: jobId,
      source: "campaign",
    },
  }));
}
