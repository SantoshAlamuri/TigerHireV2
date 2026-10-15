import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/security/rate-limit";
import { logger } from "@/lib/observability/logger";
import {
  consultantInviteUsability,
  consultantInviteTokenSchema,
} from "@/lib/validations/consultant-invites";

const INVITE_FIELDS =
  "id, company_organisation_id, agency_organisation_id, invited_email, invited_agency_name, status, expires_at";

const UNUSABLE_MESSAGE: Record<string, string> = {
  accepted: "This invitation has already been accepted",
  revoked: "This invitation was revoked by the company",
  expired: "This invitation has expired",
};

/**
 * GET /api/consultant-invites/[token]
 * Invite details for the accept page. Readable before sign-in — the token is the
 * capability, so nothing beyond the company name and invited email is returned.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token: rawToken } = await params;
    const parsedToken = consultantInviteTokenSchema.safeParse(rawToken);
    if (!parsedToken.success) return jsonError("Invitation not found", 404);
    const token = parsedToken.data;

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await checkRateLimit({
      key: `consultant-invite:get:${token}:${ip}`,
      ...RATE_LIMIT_PRESETS.default,
    });
    if (!rl.allowed) return jsonError("Too many attempts, please try again shortly", 429);

    const admin = createSupabaseAdmin();
    const { data: invite, error } = await admin
      .from("agency_client_invites")
      .select(INVITE_FIELDS)
      .eq("token", token)
      .maybeSingle();

    if (error || !invite) return jsonError("Invitation not found", 404);

    const usability = consultantInviteUsability(invite);
    if (!usability.usable) {
      return jsonError(
        UNUSABLE_MESSAGE[usability.reason] ?? "This invitation is no longer valid",
        410,
      );
    }

    const { data: company } = await admin
      .from("organisations")
      .select("name")
      .eq("id", invite.company_organisation_id)
      .maybeSingle();

    return jsonSuccess({
      email: invite.invited_email,
      agencyName: invite.invited_agency_name,
      company: { name: company?.name ?? "A company" },
      expiresAt: invite.expires_at,
    });
  } catch (err) {
    return handleApiError(err, "Failed to load invitation", {
      route: "GET /api/consultant-invites/[token]",
    });
  }
}

/**
 * POST /api/consultant-invites/[token]
 * Accept the invitation. Must be signed in as an agency user; the caller's own
 * agency org is the one that gets linked — the token never names it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const { token: rawToken } = await params;
    const parsedToken = consultantInviteTokenSchema.safeParse(rawToken);
    if (!parsedToken.success) return jsonError("Invitation not found", 404);
    const token = parsedToken.data;

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await checkRateLimit({
      key: `consultant-invite:accept:${token}:${ip}`,
      ...RATE_LIMIT_PRESETS.auth,
    });
    if (!rl.allowed) return jsonError("Too many attempts, please try again shortly", 429);

    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) {
      return jsonError("Sign in with your firm's TigerHire account to accept", 401);
    }
    if (ctx.role !== "agency") {
      return jsonError(
        "Only a consulting firm account can accept this invitation. Sign in with your agency account, or create one first.",
        403,
      );
    }
    if (!ctx.organisationId) {
      return jsonError("Your account is not attached to a firm yet", 400);
    }

    const admin = createSupabaseAdmin();
    const { data: invite, error } = await admin
      .from("agency_client_invites")
      .select(INVITE_FIELDS)
      .eq("token", token)
      .maybeSingle();

    if (error || !invite) return jsonError("Invitation not found", 404);

    const usability = consultantInviteUsability(invite);
    if (!usability.usable) {
      return jsonError(
        UNUSABLE_MESSAGE[usability.reason] ?? "This invitation is no longer valid",
        410,
      );
    }

    if (invite.company_organisation_id === ctx.organisationId) {
      return jsonError("You cannot accept your own organisation's invitation", 400);
    }

    // When the invite was addressed to a known firm, only that firm may accept —
    // a forwarded link must not let a different agency claim the access.
    if (invite.agency_organisation_id && invite.agency_organisation_id !== ctx.organisationId) {
      return jsonError("This invitation was issued to a different firm", 403);
    }

    const now = new Date().toISOString();

    const { data: existingLink } = await admin
      .from("agency_clients")
      .select("id, status")
      .eq("agency_organisation_id", ctx.organisationId)
      .eq("client_organisation_id", invite.company_organisation_id)
      .maybeSingle();

    if (existingLink && existingLink.status === "pending") {
      // The firm had already asked and this invite is the company's answer.
      await admin
        .from("agency_clients")
        .update({
          status: "active",
          is_active: true,
          decided_at: now,
          decided_by: ctx.userId,
        })
        .eq("id", existingLink.id);
    }

    if (!existingLink) {
      // The company consented when it sent the invite, so this link is live on
      // acceptance — unlike an agency-raised request, which starts `pending`.
      const { error: linkError } = await admin.from("agency_clients").insert({
        agency_organisation_id: ctx.organisationId,
        client_organisation_id: invite.company_organisation_id,
        is_active: true,
        status: "active",
        initiated_by: "company",
        decided_at: now,
        decided_by: ctx.userId,
      });
      if (linkError && linkError.code !== "23505") {
        logger.error("Failed to create agency_clients link from consultant invite", {
          error: linkError.message,
          code: linkError.code,
          inviteId: invite.id,
        });
        return jsonError("Failed to accept invitation", 500);
      }
    }

    const { error: updateError } = await admin
      .from("agency_client_invites")
      .update({
        status: "accepted",
        accepted_at: now,
        accepted_by: ctx.userId,
        agency_organisation_id: ctx.organisationId,
      })
      .eq("id", invite.id)
      .eq("status", "pending");

    if (updateError) {
      // The link exists but the invite is still pending — log loudly so it can be
      // reconciled; the firm already has access, so don't fail the user here.
      logger.warn("Consultant invite accepted but status update failed", {
        error: updateError.message,
        inviteId: invite.id,
      });
    }

    logger.info("Consultant invite accepted", {
      inviteId: invite.id,
      companyOrganisationId: invite.company_organisation_id,
      agencyOrganisationId: ctx.organisationId,
    });

    return jsonSuccess({
      message: "Invitation accepted",
      companyOrganisationId: invite.company_organisation_id,
      redirectTo: "/agency/clients",
    });
  } catch (err) {
    return handleApiError(err, "Failed to accept invitation", {
      route: "POST /api/consultant-invites/[token]",
    });
  }
}
