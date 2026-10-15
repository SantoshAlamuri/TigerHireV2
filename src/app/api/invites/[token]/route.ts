import { NextRequest } from "next/server";
import { jsonError, jsonSuccess, handleApiError } from "@/lib/api-helpers";
import { logger } from "@/lib/observability/logger";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteCachedAuthProfile } from "@/lib/redis/auth-profile-cache";
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/security/rate-limit";
import { validateOrigin } from "@/lib/security/csrf";
import { isOrgInviteRole } from "@/types/database";

const INVITE_ACCEPT_SELECT_FIELDS = "id, email, role, organisation_id, expires_at, accepted_at";

/**
 * GET /api/invites/[token] — get invite details (pre-registration)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await checkRateLimit({
      key: `invites:get:${token}:${ip}`,
      ...RATE_LIMIT_PRESETS.default,
    });
    if (!rl.allowed) return jsonError("Too many attempts, please try again shortly", 429);
    const admin = createSupabaseAdmin();

    const { data: invite, error } = await admin
      .from("invites")
      .select("id, email, role, expires_at, accepted_at, organisations(name)")
      .eq("token", token)
      .single();

    if (error || !invite) return jsonError("Invite not found", 404);

    if (invite.accepted_at) {
      return jsonError("This invite has already been used", 410);
    }

    if (new Date(invite.expires_at) < new Date()) {
      return jsonError("This invite has expired", 410);
    }

    return jsonSuccess({
      email: invite.email,
      role: invite.role,
      organisation: invite.organisations,
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch invite", {
      route: "GET /api/invites/[token]",
    });
  }
}

/**
 * POST /api/invites/[token] — accept invite (after registering/logging in)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const { token } = await params;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await checkRateLimit({
      key: `invites:accept:${token}:${ip}`,
      ...RATE_LIMIT_PRESETS.default,
    });
    if (!rl.allowed) return jsonError("Too many attempts, please try again shortly", 429);
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return jsonError("You must be logged in to accept an invite", 401);

    const admin = createSupabaseAdmin();

    const { data: invite, error } = await admin
      .from("invites")
      .select(INVITE_ACCEPT_SELECT_FIELDS)
      .eq("token", token)
      .single();

    if (error || !invite) return jsonError("Invite not found", 404);
    if (invite.accepted_at) return jsonError("Invite already used", 410);
    if (new Date(invite.expires_at) < new Date()) return jsonError("Invite expired", 410);

    // Verify email matches
    if (user.email !== invite.email) {
      return jsonError("This invite was sent to a different email address", 403);
    }

    // Fail closed: never grant a role that is not a valid org-invite role
    // (guards against a tampered/legacy invite row escalating privilege).
    if (!isOrgInviteRole(invite.role)) {
      logger.error("Invite accept rejected: invalid role on invite", {
        inviteId: invite.id,
        role: invite.role,
      });
      return jsonError("This invite has an invalid role and cannot be accepted", 400);
    }

    // Update profile: set role and organisation
    await admin
      .from("profiles")
      .update({
        role: invite.role,
        organisation_id: invite.organisation_id,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    // Keep additive enterprise roles in sync for invite-based onboarding.
    await admin.from("employee_roles").upsert({
      employee_id: user.id,
      role: invite.role,
      source: "invite",
    });

    // Invalidate cached auth profile so middleware/getAuthContext pick up the new role immediately
    await deleteCachedAuthProfile(user.id);

    // Mark invite as accepted
    await admin
      .from("invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    return jsonSuccess({
      message: "Invite accepted. Welcome to the team!",
      role: invite.role,
      organisationId: invite.organisation_id,
    });
  } catch (err) {
    return handleApiError(err, "Failed to accept invite", {
      route: "POST /api/invites/[token]",
    });
  }
}
