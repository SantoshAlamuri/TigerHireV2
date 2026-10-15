/**
 * Canonical WhatsApp FitScore routing: hybrid v2 when JD Base is approved;
 * acknowledgement template + pending_jd_approval queue when not (Message path).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueuePendingJdApprovalPair, isJdBaseApproved } from "@/lib/fitscore/pending-jd-approval";
import type { CandidateData, JobData } from "@/lib/fitscore/types";
import {
  FitScoreService,
  numericOverallFromFitScoreServiceResult,
} from "@/lib/services/FitScoreService";
import { sendApplicationReceivedTemplate, sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { logger } from "@/lib/observability/logger";

export type WhatsAppJobScoreResult =
  | { status: "scored"; overallScore: number; band?: string }
  | { status: "pending_jd_approval" }
  | { status: "prescreen_gate_pending" }
  | { status: "error"; message: string };

export type WhatsAppApplicationAck = {
  phone: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  applicationId?: string;
};

export async function fetchJobTitleAndCompany(
  supabase: SupabaseClient,
  jobId: string,
): Promise<{ jobTitle: string; companyName: string } | null> {
  const { data, error } = await supabase
    .from("jobs")
    .select("title, organisations!jobs_organisation_id_fkey ( name )")
    .eq("id", jobId)
    .maybeSingle();

  if (error || !data) return null;

  const orgRow = (data as { organisations?: { name?: string } | { name?: string }[] | null })
    .organisations;
  const org = Array.isArray(orgRow) ? orgRow[0] : orgRow;
  return {
    jobTitle: String((data as { title?: string }).title ?? "the role"),
    companyName: (org as { name?: string } | null | undefined)?.name ?? "the company",
  };
}

async function sendApplicationAcknowledgement(ack: WhatsAppApplicationAck): Promise<void> {
  try {
    const result = await sendApplicationReceivedTemplate({
      phone: ack.phone,
      candidateName: ack.candidateName,
      jobTitle: ack.jobTitle,
      companyName: ack.companyName,
      applicationId: ack.applicationId,
    });
    if (!result.success) {
      logger.warn("WhatsApp: th_application_received send failed", {
        phone: ack.phone,
        error: result.error,
      });
    }
  } catch (err) {
    logger.warn("WhatsApp: th_application_received threw", {
      phone: ack.phone,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function readPersistedScoreRow(
  supabase: SupabaseClient,
  jobId: string,
  candidateId: string,
): Promise<{ overallScore: number }> {
  const { data: row } = await supabase
    .from("fit_scores")
    .select("overall_score, scoring_version")
    .eq("candidate_id", candidateId)
    .eq("job_id", jobId)
    .or("is_test_run.eq.false,is_test_run.is.null")
    .is("superseded_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    overallScore: Number(row?.overall_score ?? 0),
  };
}

/**
 * Score one candidate against one job for WhatsApp flows.
 * Never invokes three-stage scoring. When JD Base is unapproved and `applicationAck`
 * is set, sends `th_application_received` and enqueues `pending_jd_approval`.
 */
export async function scoreWhatsAppJobForCandidate(params: {
  supabase: SupabaseClient;
  jobId: string;
  jobData: JobData;
  candidateId: string;
  candidate: CandidateData;
  applicationAck?: WhatsAppApplicationAck;
}): Promise<WhatsAppJobScoreResult> {
  const { supabase, jobId, candidateId, candidate, applicationAck } = params;

  const approved = await isJdBaseApproved(supabase, jobId);
  if (!approved) {
    await enqueuePendingJdApprovalPair(supabase, jobId, candidateId);
    if (applicationAck) {
      await sendApplicationAcknowledgement(applicationAck);
      await sendWhatsAppMessage(
        applicationAck.phone,
        `You're in for *${applicationAck.jobTitle}* at ${applicationAck.companyName}. The hiring manager is finalising the scoring bar for this role, so your FitScore is queued. We'll message you when it is ready; if the role closes before then, we'll tell you too.`,
      );
    }
    return { status: "pending_jd_approval" };
  }

  try {
    const result = await FitScoreService.computeSingle(supabase, jobId, candidateId, {
      source: "upload",
      onUnapprovedJdBase: "queue_pending",
    });

    if (
      result &&
      typeof result === "object" &&
      "scoring_status" in result &&
      (result as { scoring_status: string }).scoring_status === "pending_jd_approval"
    ) {
      if (applicationAck) {
        await sendApplicationAcknowledgement(applicationAck);
        await sendWhatsAppMessage(
          applicationAck.phone,
          `You're in for *${applicationAck.jobTitle}* at ${applicationAck.companyName}. The hiring manager is finalising the scoring bar for this role, so your FitScore is queued. We'll message you when it is ready; if the role closes before then, we'll tell you too.`,
        );
      }
      return { status: "pending_jd_approval" };
    }

    if (
      result &&
      typeof result === "object" &&
      "scoring_status" in result &&
      (result as { scoring_status: string }).scoring_status === "prescreen_gate_blocked"
    ) {
      return { status: "prescreen_gate_pending" };
    }

    const numeric = numericOverallFromFitScoreServiceResult(result);
    const persisted = await readPersistedScoreRow(supabase, jobId, candidateId);
    const overallScore = numeric ?? persisted.overallScore;

    const band =
      result && typeof result === "object" && "fitLabel" in result
        ? String((result as { fitLabel?: string }).fitLabel ?? "")
        : result && typeof result === "object" && "band" in result
          ? String((result as { band?: string }).band ?? "")
          : undefined;

    return {
      status: "scored",
      overallScore,
      band: band || undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("WhatsApp: FitScoreService.computeSingle failed", {
      job_id: jobId,
      candidate_id: candidateId,
      error: message,
    });
    return { status: "error", message };
  }
}
