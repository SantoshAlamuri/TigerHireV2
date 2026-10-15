import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
  handleApiError,
} from "@/lib/api-helpers";
import { adminResetPasswordSchema } from "@/lib/validations/organisations";
import { logger } from "@/lib/observability/logger";
import { validateOrigin } from "@/lib/security/csrf";

/**
 * POST /api/admin/users/reset-password
 * Super admin can reset any user's password.
 * Body: { email: string, newPassword: string }
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const { body, errorResponse } = await parseJsonBody(
      request,
      "POST /api/admin/users/reset-password",
    );
    if (errorResponse) return errorResponse;

    const parsed = adminResetPasswordSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);
    const { email, newPassword } = parsed.data;

    const admin = createSupabaseAdmin();

    // Find the user by email in auth.users
    const { data: userList, error: listError } = await admin.auth.admin.listUsers({
      perPage: 1000,
    });

    if (listError) {
      return jsonError("Failed to look up users", 500);
    }

    const targetUser = userList.users.find(
      (u) => u.email?.toLowerCase() === email.trim().toLowerCase(),
    );

    if (!targetUser) {
      return jsonError(`No user found with email: ${email}`, 404);
    }

    // Reset the password
    const { error: updateError } = await admin.auth.admin.updateUserById(targetUser.id, {
      password: newPassword,
      email_confirm: true, // Ensure email is confirmed so they can login
    });

    if (updateError) {
      logger.error("Admin password reset failed", {
        targetUserId: targetUser.id,
        error: updateError.message,
      });
      return jsonError("Failed to reset password", 500);
    }

    logger.info("Admin password reset", {
      targetUserId: targetUser.id,
      targetEmail: email,
      resetBy: ctx.userId,
    });

    return jsonSuccess({
      message: `Password reset successfully for ${email}`,
      userId: targetUser.id,
    });
  } catch (err) {
    return handleApiError(err, "Failed to reset password", {
      route: "POST /api/admin/users/reset-password",
    });
  }
}
