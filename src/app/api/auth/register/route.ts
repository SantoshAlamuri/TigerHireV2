import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { registerSchema } from "@/lib/validations/auth";
import { toUserFacingAuthError } from "@/lib/auth/sanitize-auth-error";
import { parseJsonBody, jsonError, jsonSuccess, handleZodError } from "@/lib/api-helpers";
import { logger } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/report-error";
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/security/rate-limit";
import {
  shouldEnforceAuthCsrfToken,
  startAuthCsrfIssuerProbe,
  validateOrigin,
} from "@/lib/security/csrf";
import type { UserRole } from "@/types";
import { incrementAuthRequestTotal } from "@/lib/observability/auth-csrf-metrics";

/**
 * Stateless Supabase client for signup — intentionally does NOT read browser
 * cookies. Stale session cookies from a previously-deleted user would
 * otherwise pollute the GoTrue client state and can cause signUp to fail.
 */
function createStatelessSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase env vars (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY) are required.",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function mapUserTypeToRole(userType: string): UserRole {
  switch (userType) {
    case "company":
      return "leadership";
    case "agency":
      return "agency";
    case "candidate":
      return "candidate_free";
    default:
      return "candidate_free";
  }
}

export async function POST(request: NextRequest) {
  incrementAuthRequestTotal("register");
  startAuthCsrfIssuerProbe(request);
  const csrf = validateOrigin(request, { requireToken: shouldEnforceAuthCsrfToken() });
  if (csrf) return csrf;
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const rl = await checkRateLimit({
      key: `auth:${ip}`,
      ...RATE_LIMIT_PRESETS.auth,
    });
    if (!rl.allowed) return jsonError("Too many registration attempts. Please wait a minute.", 429);

    const parsedBody = await parseJsonBody(request, "POST /api/auth/register");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = registerSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const { email: rawEmail, password, fullName, userType, organisationName } = parsed.data;
    const email = rawEmail.trim().toLowerCase();
    const supabase = createStatelessSupabaseClient();

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, user_type: userType },
      },
    });

    const isAlreadyRegistered =
      authError &&
      /already registered|already exists|already been registered|user already exist/i.test(
        authError.message,
      );
    if (isAlreadyRegistered) {
      return jsonError(
        "An account with this email is already registered. Please sign in instead.",
        400,
      );
    }
    if (authError) {
      logger.error("Supabase signUp failed", {
        error: authError.message,
        status: authError.status,
        ...(process.env.NODE_ENV === "development" && { email }),
      });
      return jsonError(toUserFacingAuthError(authError.message), 400);
    }

    // Supabase may return a user with empty identities when email confirmation is on and email exists
    if (authData.user && authData.user.identities?.length === 0) {
      return jsonError(
        "An account with this email is already registered. Please sign in instead.",
        400,
      );
    }
    if (!authData.user) {
      return jsonError(
        process.env.NODE_ENV === "development"
          ? "Registration failed: no user returned from sign up"
          : "We couldn't create your account. Please try again or contact support.",
        500,
      );
    }

    const admin = createSupabaseAdmin();
    const role = mapUserTypeToRole(userType);
    const orgName =
      userType === "company" || userType === "agency"
        ? organisationName?.trim() || `${fullName}'s Company`
        : null;
    const orgType = userType === "company" || userType === "agency" ? userType : null;

    const { data: organisationId, error: rpcError } = await admin.rpc(
      "register_create_org_and_profile",
      {
        p_user_id: authData.user.id,
        p_role: role,
        p_full_name: fullName,
        p_org_name: orgName,
        p_org_type: orgType,
      },
    );

    if (rpcError) {
      logger.error("Register create org and profile failed", {
        error: String(rpcError),
        code: rpcError.code,
        details: rpcError.details,
        userId: authData.user.id,
        ...(process.env.NODE_ENV === "development" && { email }),
      });
      try {
        await admin.auth.admin.deleteUser(authData.user.id);
      } catch (deleteErr) {
        logger.error("Failed to delete orphaned auth user after RPC failure", {
          userId: authData.user.id,
          error: String(deleteErr),
        });
      }
      const devHint = process.env.NODE_ENV === "development" ? ` ${rpcError.message}` : "";
      const userMessage =
        process.env.NODE_ENV === "development"
          ? `Failed to create profile.${devHint}`
          : "We couldn't set up your account. Please try again. If the problem continues, contact support.";
      return jsonError(userMessage, 500);
    }

    const needsEmailConfirmation =
      (!authData.session && authData.user.identities?.length === 0) || !authData.session;

    return jsonSuccess(
      {
        user: {
          id: authData.user.id,
          email: authData.user.email,
          role,
          organisationId: organisationId ?? null,
        },
        confirmed: !needsEmailConfirmation,
        message:
          userType === "agency"
            ? "Registration received — your agency account requires admin approval."
            : needsEmailConfirmation
              ? "Registration successful. Please check your email to verify your account."
              : "Registration successful.",
      },
      201,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reportError(err, { route: "/api/auth/register", message });
    // In development, surface config errors so missing env vars are obvious
    const isConfigError =
      /SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE|required for admin|env\.local/i.test(message);
    if (process.env.NODE_ENV === "development" && isConfigError) {
      return jsonError(
        `Server configuration error: ${message}. Check .env.local has NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.`,
        503,
      );
    }
    const userMessage =
      process.env.NODE_ENV === "development"
        ? `Registration failed: ${message}`
        : "We couldn't create your account. Please try again. If the problem continues, contact support.";
    return jsonError(userMessage, 500);
  }
}
