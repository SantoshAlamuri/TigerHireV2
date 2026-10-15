import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/security/rate-limit";
import { consultantInviteCreateSchema } from "@/lib/validations/consultant-invites";
import { canViewConsultants, canManageConsultants } from "@/lib/consultants/access";
import {
  listCompanyConsultants,
  listCompanyConsultantInvites,
} from "@/lib/consultants/list-consultants";
import { createConsultantInvite } from "@/lib/consultants/create-invite";

/**
 * GET /api/company/consultants
 * Consulting firms linked to the caller's company, plus outstanding invitations.
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!canViewConsultants(ctx)) return jsonError("Forbidden", 403);
    if (!ctx.organisationId) return jsonError("No organisation associated with your account", 400);

    const admin = createSupabaseAdmin();
    const consultants = await listCompanyConsultants(admin, ctx.organisationId);
    if (consultants === null) return jsonError("Failed to load consultants", 500);

    const invites = await listCompanyConsultantInvites(admin, ctx.organisationId);

    // A firm that asked but has not been approved is a REQUEST, not a consultant.
    // Keeping them in one list is how a company ends up approving by not noticing.
    return jsonSuccess({
      consultants: consultants.filter((c) => c.status === "active"),
      requests: consultants.filter((c) => c.status === "pending"),
      invites,
      canManage: canManageConsultants(ctx),
    });
  } catch (err) {
    return handleApiError(err, "Failed to load consultants", {
      route: "GET /api/company/consultants",
    });
  }
}

/**
 * POST /api/company/consultants
 * Invite an external consulting firm to work on this company's roles.
 * Body: { email: string, agencyName?: string, note?: string }
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!canManageConsultants(ctx)) {
      return jsonError("Only leadership can invite a consulting firm", 403);
    }
    if (!ctx.organisationId) return jsonError("No organisation associated with your account", 400);

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await checkRateLimit({
      key: `consultant-invite:${ctx.organisationId}:${ip}`,
      ...RATE_LIMIT_PRESETS.default,
    });
    if (!rl.allowed) return jsonError("Too many invites, please try again shortly", 429);

    const parsedBody = await parseJsonBody(request, "POST /api/company/consultants");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = consultantInviteCreateSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const supabase = await createSupabaseServerClient();
    const { data: company } = await supabase
      .from("organisations")
      .select("id, name, type")
      .eq("id", ctx.organisationId)
      .maybeSingle();
    if (!company) return jsonError("Organisation not found", 404);
    if (company.type !== "company") {
      return jsonError("Only companies can invite a consulting firm", 400);
    }

    const { data: inviter } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", ctx.userId)
      .maybeSingle();

    const result = await createConsultantInvite({
      admin: createSupabaseAdmin(),
      companyOrganisationId: ctx.organisationId,
      companyName: company.name,
      inviterUserId: ctx.userId,
      inviterName: inviter?.full_name ?? "Your contact",
      email: parsed.data.email,
      agencyName: parsed.data.agencyName,
      note: parsed.data.note,
    });

    if (!result.ok) return jsonError(result.error, result.status);

    return jsonSuccess(
      {
        invite: result.invite,
        emailed: result.emailed,
        message: result.emailed
          ? "Invitation sent"
          : "Invitation created, but the email could not be sent. Share the link from this page instead.",
      },
      201,
    );
  } catch (err) {
    return handleApiError(err, "Failed to invite consultant", {
      route: "POST /api/company/consultants",
    });
  }
}
