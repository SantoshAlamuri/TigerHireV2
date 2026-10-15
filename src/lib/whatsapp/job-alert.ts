import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { JobData } from "@/lib/fitscore/types";
import { scoreWhatsAppJobForCandidate } from "@/lib/whatsapp/fitscore-routing";
import { getCandidatePreferences } from "@/lib/preferences/get-preferences";
import { hasPreferences, type CandidateJobPreferences } from "@/lib/preferences/types";
import { sendThNewRoleAlert } from "@/lib/services/whatsapp";
import { logger } from "@/lib/observability/logger";
import { FITSCORE_MIN_THRESHOLD, MAX_ALERT_GAP_HOURS } from "./constants";

function jobMatchesPreferences(
  job: Record<string, unknown>,
  prefs: CandidateJobPreferences | null,
): boolean {
  if (!prefs || !hasPreferences(prefs)) return false;

  const title = String(job.title ?? "").toLowerCase();
  const loc = String(job.location ?? "").toLowerCase();
  const roleFn = job.role_function as string | null;
  const seniority = job.seniority_level as string | null;

  const qa = prefs.whatsapp_qa;
  if (qa?.role_family?.trim()) {
    const r = qa.role_family.trim().toLowerCase();
    if (!title.includes(r) && (!roleFn || !roleFn.toLowerCase().includes(r))) {
      return false;
    }
  }

  if (prefs.preferred_role_functions?.length) {
    if (!roleFn || !prefs.preferred_role_functions.includes(roleFn)) return false;
  }

  if (prefs.preferred_locations?.length) {
    const locs = prefs.preferred_locations.map((l) => l.toLowerCase());
    const remoteOk = locs.some((l) => l.includes("remote"));
    if (remoteOk && job.remote_allowed) {
      /* ok */
    } else {
      const any = locs.some((l) => loc.includes(l) || l.includes("remote"));
      if (!any) return false;
    }
  } else if (qa?.location_raw?.trim()) {
    const raw = qa.location_raw.trim().toLowerCase();
    if (raw.includes("remote")) {
      if (!job.remote_allowed) return false;
    } else if (!loc.includes(raw)) {
      return false;
    }
  }

  if (prefs.preferred_seniority?.length && seniority) {
    if (!prefs.preferred_seniority.includes(seniority)) return false;
  }

  return true;
}

/**
 * Fire when a job becomes `open`: notify active WhatsApp alert subscribers (candidate-only).
 */
export async function onJobPublished(jobId: string): Promise<void> {
  const supabase = createSupabaseAdmin();
  const now = new Date();
  const cutoff = new Date(now.getTime() - MAX_ALERT_GAP_HOURS * 60 * 60 * 1000).toISOString();

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("status", "open")
    .maybeSingle();

  if (jobErr || !job) {
    logger.warn("onJobPublished: job not found or not open", { jobId });
    return;
  }

  const nowIso = now.toISOString();
  const { data: sessions, error: sessErr } = await supabase
    .from("whatsapp_sessions")
    .select("phone, context, alert_last_sent_at, alerts_expires_at")
    .eq("session_state", "active_alerts")
    .not("alerts_expires_at", "is", null)
    .gt("alerts_expires_at", nowIso);

  if (sessErr) {
    logger.error("onJobPublished: sessions query failed", { error: String(sessErr) });
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

  for (const row of sessions ?? []) {
    const last = row.alert_last_sent_at as string | null;
    if (last && last > cutoff) continue;

    const ctx = (row.context ?? {}) as Record<string, unknown>;
    const candidateId = ctx.candidate_id as string | undefined;
    if (!candidateId) continue;

    const prefs = await getCandidatePreferences(supabase, candidateId);
    if (!jobMatchesPreferences(job as Record<string, unknown>, prefs)) continue;

    const { data: candidate } = await supabase
      .from("candidates")
      .select("*")
      .eq("id", candidateId)
      .single();
    if (!candidate) continue;

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

    const outcome = await scoreWhatsAppJobForCandidate({
      supabase,
      jobId,
      jobData,
      candidateId,
      candidate: candidateForScore,
    });
    if (outcome.status !== "scored") {
      if (outcome.status === "error") {
        logger.warn("onJobPublished: FitScore failed", {
          jobId,
          candidateId,
          error: outcome.message,
        });
      }
      continue;
    }

    const scoreValue = outcome.overallScore;
    if (scoreValue < FITSCORE_MIN_THRESHOLD) continue;

    const phone = row.phone as string;
    const firstName =
      (candidate.name ?? candidate.full_name ?? "there").toString().split(" ")[0] || "there";

    await sendThNewRoleAlert({
      phone,
      name: firstName,
      title: String(job.title ?? "Role"),
      location: (job.location as string) || "—",
      score: String(scoreValue),
    });

    await supabase
      .from("whatsapp_sessions")
      .update({
        alert_last_sent_at: now.toISOString(),
        last_message_at: now.toISOString(),
      })
      .eq("phone", phone.replace(/\D/g, ""));
  }
}
