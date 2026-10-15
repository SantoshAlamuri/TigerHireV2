import { NextRequest } from "next/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { SessionRepository } from "@/lib/repositories/SessionRepository";

type FlowEventType =
  | "application_received"
  | "whatsapp_opt_in"
  | "interview_scheduled"
  | "interview_outcome"
  | "offer_sent"
  | "offer_accepted"
  | "offer_signed";

interface FlowEvent {
  type: FlowEventType;
  at: string | null;
  status: "pending" | "completed";
  label: string;
}

function sortFlowEvents(events: FlowEvent[]): FlowEvent[] {
  return [...events].sort((a, b) => {
    if (!a.at && !b.at) return 0;
    if (!a.at) return 1;
    if (!b.at) return -1;
    return new Date(a.at).getTime() - new Date(b.at).getTime();
  });
}

/**
 * GET /api/whatsapp/flow-status?jobId=<uuid>&candidateId=<uuid>
 * Returns scheduling + offer-signing milestones for WhatsApp-driven flows.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "hiring_manager", "agency")) {
      return jsonError("Forbidden", 403);
    }

    const jobId = request.nextUrl.searchParams.get("jobId");
    const candidateId = request.nextUrl.searchParams.get("candidateId");
    if (!jobId || !candidateId) return jsonError("jobId and candidateId are required", 422);

    const admin = createSupabaseAdmin();
    const { data: job } = await admin
      .from("jobs")
      .select("id, organisation_id")
      .eq("id", jobId)
      .maybeSingle();
    if (!job) return jsonError("Job not found", 404);
    if (!hasRole(ctx, "super_admin") && job.organisation_id !== ctx.organisationId) {
      return jsonError("Forbidden", 403);
    }

    // Every query in this route named something that does not exist, so this
    // admin lookup has never returned anything but "not found" at every step:
    //   - applications has no interview_scheduled_at / interview_outcome /
    //     candidate_phone. The interview fields are on pipeline_candidates; the
    //     phone is on candidates.
    //   - offers has no job_id (it links through application_id), no
    //     accepted_at (responded_at / signed_at), and no signed_document_url
    //     (signed_pdf_path).
    //   - there is no `interviews` table at all.
    const [{ data: application }, { data: pipelineRow }, { data: candidate }] = await Promise.all([
      admin
        .from("applications")
        .select("id, status")
        .eq("job_id", jobId)
        .eq("candidate_id", candidateId)
        .maybeSingle(),
      admin
        .from("pipeline_candidates")
        .select("id, status, interview_scheduled_at, interview_outcome")
        .eq("job_id", jobId)
        .eq("candidate_id", candidateId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.from("candidates").select("phone").eq("id", candidateId).maybeSingle(),
    ]);

    // Offers hang off the application, not the job.
    const { data: offer } = application?.id
      ? await admin
          .from("offers")
          .select("id, status, signing_status, sent_at, responded_at, signed_at, signed_pdf_path")
          .eq("application_id", application.id as string)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

    const interview = pipelineRow
      ? {
          scheduled_at: pipelineRow.interview_scheduled_at as string | null,
          outcome: pipelineRow.interview_outcome as string | null,
        }
      : null;

    // Apply-based tenancy: `candidates` has no organisation_id, so only expose
    // the phone / opt-in bit when this candidate actually applied to this
    // org-owned job (application row exists). Otherwise it is a cross-org oracle.
    const phone = application ? ((candidate?.phone as string | null) ?? "") : "";
    const optedIn = phone ? await SessionRepository.hasOptedIn(admin, phone) : false;
    const timeline = sortFlowEvents([
      {
        type: "application_received",
        at: null,
        status: application ? "completed" : "pending",
        label: application ? "Application received" : "Application not found",
      },
      {
        type: "whatsapp_opt_in",
        at: null,
        status: optedIn ? "completed" : "pending",
        label: optedIn ? "WhatsApp opt-in confirmed" : "WhatsApp opt-in pending",
      },
      {
        type: "interview_scheduled",
        at: (interview?.scheduled_at as string | null) ?? null,
        status: interview?.scheduled_at ? "completed" : "pending",
        label: interview?.scheduled_at ? "Interview scheduled" : "Interview not scheduled",
      },
      {
        type: "interview_outcome",
        at: null,
        status: interview?.outcome ? "completed" : "pending",
        label: interview?.outcome
          ? `Interview outcome: ${interview.outcome}`
          : "Interview outcome pending",
      },
      {
        type: "offer_sent",
        at: (offer?.sent_at as string | null) ?? null,
        status: offer?.sent_at ? "completed" : "pending",
        label: offer?.sent_at ? "Offer sent" : "Offer not sent",
      },
      {
        type: "offer_accepted",
        at: (offer?.responded_at as string | null) ?? null,
        status: offer?.responded_at ? "completed" : "pending",
        label: offer?.responded_at ? "Offer accepted" : "Offer acceptance pending",
      },
      {
        type: "offer_signed",
        at: (offer?.signed_at as string | null) ?? null,
        status: offer?.signed_pdf_path ? "completed" : "pending",
        label: offer?.signed_pdf_path ? "Signed document available" : "Signed document pending",
      },
    ]);

    return jsonSuccess({
      jobId,
      candidateId,
      whatsappOptIn: optedIn,
      timeline,
      interview: pipelineRow
        ? {
            status: pipelineRow.status,
            scheduledAt: interview?.scheduled_at ?? null,
            outcome: interview?.outcome ?? null,
          }
        : null,
      application: application ? { status: application.status } : null,
      offer: offer
        ? {
            status: offer.status,
            signingStatus: offer.signing_status,
            sentAt: offer.sent_at,
            acceptedAt: offer.responded_at,
            signedAt: offer.signed_at,
            hasSignedDocument: Boolean(offer.signed_pdf_path),
          }
        : null,
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch WhatsApp flow status", {
      route: "GET /api/whatsapp/flow-status",
    });
  }
}
