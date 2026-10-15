import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  ensureOrganisationAccess,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { hasAnyEnterpriseRole } from "@/lib/security/enterprise-roles";
import { validateOrigin } from "@/lib/security/csrf";
import { insertOfferEvent } from "@/lib/offers/offer-events";
import { sendNativeOfferReminderCandidateEmail } from "@/lib/offers/offer-native-notifications";
import { env } from "@/lib/config/env";
import { forbidUnlessHiringManagerOwnsOfferJob } from "@/lib/security/hiring-manager-offer-access";

const remindOfferBodySchema = z.object({}).strict();

const offerIdParamsSchema = z.object({
  id: z.string().uuid(),
});

/**
 * POST /api/offers/[id]/signing/remind — recruiter-triggered reminder email.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const paramsParsed = offerIdParamsSchema.safeParse(await params);
    if (!paramsParsed.success) return jsonError("Invalid offer id", 400);
    const { id } = paramsParsed.data;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    const body = await request.json().catch(() => ({}));
    const bodyParsed = remindOfferBodySchema.safeParse(body);
    if (!bodyParsed.success) return jsonError("Invalid request body", 400);

    const supabase = await createSupabaseServerClient();
    const allowed = await hasAnyEnterpriseRole(
      ctx.userId,
      ["leadership", "recruiter", "hiring_manager", "super_admin"],
      supabase,
    );
    if (!allowed) return jsonError("Forbidden", 403);

    const admin = createSupabaseAdmin();
    const { data: offer, error } = await admin
      .from("offers")
      .select(
        "id, organisation_id, status, signing_status, expires_at, role_title, public_token, applications(candidate_id)",
      )
      .eq("id", id)
      .maybeSingle();

    if (error || !offer) return jsonError("Offer not found", 404);
    const orgErr = ensureOrganisationAccess(ctx, offer.organisation_id as string);
    if (orgErr) return orgErr;
    const hmErr = await forbidUnlessHiringManagerOwnsOfferJob({ ctx, admin, offerId: id });
    if (hmErr) return hmErr;

    if ((offer.status as string) !== "sent") {
      return jsonError("Reminders are only available for sent offers", 409);
    }
    if (offer.signing_status === "signed" || offer.signing_status === "declined") {
      return jsonError("Offer is already closed", 409);
    }
    if (offer.signing_status === "pending_company") {
      return jsonError("Offer is awaiting company signature before candidate reminders", 409);
    }

    const exp = offer.expires_at as string | null;
    if (!exp || new Date(exp).getTime() < Date.now()) {
      return jsonError("Offer has expired", 409);
    }

    const apps = offer.applications as { candidate_id?: string } | null;
    const cid = apps?.candidate_id as string | undefined;
    if (!cid) return jsonError("Candidate not found", 400);

    const { data: cand } = await admin
      .from("candidates")
      .select("email, name, full_name")
      .eq("id", cid)
      .maybeSingle();
    const candidateEmail = ((cand?.email as string | null) ?? "").trim();
    if (!candidateEmail) return jsonError("Candidate has no email on file", 400);

    const { data: orgRow } = await admin
      .from("organisations")
      .select("name")
      .eq("id", offer.organisation_id as string)
      .maybeSingle();
    const companyName = (orgRow?.name as string | null) ?? "Your organisation";
    const candidateDisplay =
      ((cand?.full_name as string | null) ?? "").trim() ||
      ((cand?.name as string | null) ?? "").trim() ||
      "Candidate";

    const token = offer.public_token as string | null;
    if (!token) return jsonError("Offer has no public link", 409);

    const hoursRemaining = (new Date(exp).getTime() - Date.now()) / 3600000;

    await sendNativeOfferReminderCandidateEmail({
      candidateEmail,
      candidateName: candidateDisplay,
      roleTitle: offer.role_title as string,
      companyName,
      publicToken: token,
      hoursRemaining,
    });

    await insertOfferEvent(admin, {
      offerId: id,
      eventType: "reminder_sent",
      metadata: { source: "recruiter_manual" },
    });

    return jsonSuccess({ success: true, signingUrl: `${env.baseUrl}/offers/${token}` });
  } catch (err) {
    return handleApiError(err, "Failed to send reminder", {
      route: "POST /api/offers/[id]/signing/remind",
    });
  }
}
