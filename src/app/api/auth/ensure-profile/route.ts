import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { ROLE_DASHBOARD_PATH } from "@/types";
import type { UserRole } from "@/types";
import { jsonError, jsonSuccess, handleApiError } from "@/lib/api-helpers";
import { logger } from "@/lib/observability/logger";
import { claimUnclaimedCandidateByEmail } from "@/lib/agents/candidate-dedup";
import { validateOrigin } from "@/lib/security/csrf";
import {
  checkRateLimit,
  getClientIpForRateLimit,
  RATE_LIMIT_PRESETS,
} from "@/lib/security/rate-limit";
import { z } from "zod";

const ensureProfileBodySchema = z.object({}).strict();

/**
 * Ensures the current user has a profile row (e.g. for users created manually in
 * Supabase Auth or via OAuth without going through register). Creates one with
 * role candidate_free if missing.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIpForRateLimit(request);
  const rl = await checkRateLimit({
    key: `auth:ensure-profile:${ip}`,
    ...RATE_LIMIT_PRESETS.default,
  });
  if (!rl.allowed) {
    return jsonError("Too many requests", 429);
  }

  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  const bodyRaw = await request?.json?.().catch(() => ({}));
  const bodyParsed = ensureProfileBodySchema.safeParse(bodyRaw ?? {});
  if (!bodyParsed.success) return jsonError("Invalid request body", 400);
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authUser) {
      return jsonError("Not authenticated", 401);
    }

    const admin = createSupabaseAdmin();
    const { data: existing } = await admin
      .from("profiles")
      .select("role, full_name")
      .eq("id", authUser.id)
      .single();

    if (existing) {
      // Link WhatsApp-originated candidate row to this user if same email
      if (
        (existing.role === "candidate_free" || existing.role === "candidate_pro") &&
        authUser.email
      ) {
        await claimUnclaimedCandidateByEmail(admin, authUser.id, authUser.email);
      }
      const redirectTo = ROLE_DASHBOARD_PATH[existing.role as UserRole] ?? "/";
      return jsonSuccess({
        role: existing.role,
        fullName: existing.full_name,
        redirectTo,
      });
    }

    const role: UserRole = "candidate_free";
    const fullName =
      authUser.user_metadata?.full_name ??
      authUser.user_metadata?.name ??
      authUser.email?.split("@")[0] ??
      "User";

    // organisation_id intentionally omitted: new users without an invite default to
    // candidate_free and have no org. They join an org later via invite acceptance.
    const { error: insertError } = await admin.from("profiles").insert({
      id: authUser.id,
      role,
      full_name: fullName,
    });

    if (insertError) {
      logger.error("Ensure-profile insert failed", {
        error: String(insertError),
      });
      return jsonError("Failed to create profile", 500);
    }

    // Link WhatsApp-originated candidate row to this user if same email
    if (authUser.email) {
      await claimUnclaimedCandidateByEmail(admin, authUser.id, authUser.email);
    }

    const redirectTo = ROLE_DASHBOARD_PATH[role];
    return jsonSuccess({ role, fullName, redirectTo });
  } catch (err) {
    return handleApiError(err, "Something went wrong", {
      route: "POST /api/auth/ensure-profile",
    });
  }
}
