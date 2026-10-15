import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { JobData } from "@/lib/fitscore/types";
import { scoreWhatsAppJobForCandidate } from "@/lib/whatsapp/fitscore-routing";
import { getCandidatePreferences } from "@/lib/preferences/get-preferences";
import { applyPreferencesToJobsQuery } from "@/lib/preferences/job-query";
import {
  sendThNoMatchSubscribed,
  sendThPreferenceMatches,
  sendWhatsAppMessage,
} from "@/lib/services/whatsapp";
import { logger } from "@/lib/observability/logger";
import {
  ALERT_SUBSCRIPTION_MONTHS,
  FITSCORE_MIN_THRESHOLD,
  MAX_IMMEDIATE_MATCH_JOBS,
  MAX_IMMEDIATE_MATCHES_TO_SHOW,
} from "./constants";
import { withSessionCAS, type WhatsAppSession } from "./sessions";

function addMonths(d: Date, months: number): string {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x.toISOString();
}

async function sendNoMatchWithFallback(params: {
  phone: string;
  name: string;
  role: string;
  location: string;
}): Promise<void> {
  const result = await sendThNoMatchSubscribed(params);
  if (result.success) return;
  logger.warn("Immediate match: th_no_match_subscribed failed, falling back to text", {
    phone: params.phone,
    error: result.error,
  });
  await sendWhatsAppMessage(
    params.phone,
    `No strong matches right now for ${params.role} in ${params.location}. We'll keep watching and alert you when relevant roles open.`,
  );
}

async function sendPreferenceMatchesWithFallback(params: {
  phone: string;
  name: string;
  count: string;
  roleList: string;
}): Promise<void> {
  const result = await sendThPreferenceMatches(params);
  if (result.success) return;
  logger.warn("Immediate match: th_preference_matches failed, falling back to text", {
    phone: params.phone,
    error: result.error,
  });
  await sendWhatsAppMessage(
    params.phone,
    `We found ${params.count} relevant roles for you:\n${params.roleList}\n\nReply with the role number to continue.`,
  );
}

/**
 * After Q&A completes: score up to MAX_IMMEDIATE_MATCH_JOBS jobs, top strong matches → template.
 */
export async function runImmediateMatchAfterPreferences(
  phone: string,
  session: WhatsAppSession,
): Promise<void> {
  const supabase = createSupabaseAdmin();
  const candidateId = session.context?.candidate_id as string | undefined;
  if (!candidateId) {
    logger.warn("Immediate match: missing candidate_id on session", { phone });
    await sendWhatsAppMessage(
      phone,
      "We couldn't load your profile. Please send your CV again as a PDF to continue.",
    );
    await withSessionCAS(phone, () => ({
      state: "cv_requested",
      context: { ...(session.context ?? {}) },
    }));
    return;
  }

  const { data: candidate } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", candidateId)
    .maybeSingle();
  if (!candidate) {
    logger.warn("Immediate match: candidate row not found", { candidateId });
    await sendWhatsAppMessage(
      phone,
      "We couldn't load your profile. Please send your CV again as a PDF to continue.",
    );
    await withSessionCAS(phone, () => ({
      state: "cv_requested",
      context: { ...(session.context ?? {}) },
    }));
    return;
  }

  const preferences = await getCandidatePreferences(supabase, candidateId);
  const jobsQuery = applyPreferencesToJobsQuery(supabase, preferences)
    .order("updated_at", { ascending: false })
    .limit(MAX_IMMEDIATE_MATCH_JOBS);
  const { data: jobs } = await jobsQuery;
  const jobList = (jobs ?? []) as Array<Record<string, unknown> & { id: string }>;

  const candidateForScore = {
    id: candidate.id,
    name: candidate.name ?? candidate.full_name ?? null,
    skills: candidate.skills ?? [],
    experience_years: candidate.experience_years ?? null,
    location: candidate.location ?? null,
    intent_score: null,
    resume_url: candidate.resume_url ?? null,
    updated_at: candidate.updated_at ?? null,
  };

  const firstName =
    (candidate.name ?? candidate.full_name ?? "there").toString().split(" ")[0] || "there";
  const qa = preferences?.whatsapp_qa;
  const roleHint = qa?.role_family ?? "your role";
  const locHint = qa?.location_raw ?? preferences?.preferred_locations?.[0] ?? "your location";

  if (jobList.length === 0) {
    await sendNoMatchWithFallback({
      phone,
      name: firstName,
      role: roleHint,
      location: locHint,
    });
    await withSessionCAS(phone, () => ({
      state: "active_alerts",
      context: session.context,
      extras: {
        qa_step: session.qa_step ?? 5,
        alerts_expires_at: addMonths(new Date(), ALERT_SUBSCRIPTION_MONTHS),
      },
    }));
    return;
  }

  type Scored = { job: (typeof jobList)[0]; score: number };
  const scored: Scored[] = [];

  for (const job of jobList) {
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
    const outcome = await scoreWhatsAppJobForCandidate({
      supabase,
      jobId: job.id,
      jobData,
      candidateId,
      candidate: candidateForScore,
    });
    if (outcome.status === "scored") {
      scored.push({ job, score: outcome.overallScore });
    } else if (outcome.status === "error") {
      logger.warn("Immediate match: FitScore failed", {
        job_id: job.id,
        error: outcome.message,
      });
    }
  }

  const strong = scored
    .filter((r) => r.score >= FITSCORE_MIN_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_IMMEDIATE_MATCHES_TO_SHOW);

  if (strong.length === 0) {
    await sendNoMatchWithFallback({
      phone,
      name: firstName,
      role: roleHint,
      location: locHint,
    });
  } else {
    const lines: string[] = [];
    for (let i = 0; i < strong.length; i++) {
      const r = strong[i];
      const { data: org } = await supabase
        .from("organisations")
        .select("name")
        .eq("id", r.job.organisation_id as string)
        .maybeSingle();
      const company = org?.name ?? "Company";
      lines.push(
        `${i + 1}. ${String(r.job.title ?? "Role")} at ${company} — ${(r.job.location as string) || "—"} — FitScore: ${r.score}`,
      );
    }
    await sendPreferenceMatchesWithFallback({
      phone,
      name: firstName,
      count: String(strong.length),
      roleList: lines.join("\n"),
    });
  }

  await withSessionCAS(phone, () => ({
    state: "active_alerts",
    context: session.context,
    extras: {
      qa_step: session.qa_step ?? 5,
      alerts_expires_at: addMonths(new Date(), ALERT_SUBSCRIPTION_MONTHS),
    },
  }));
}
