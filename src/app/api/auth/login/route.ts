import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { loginSchema } from "@/lib/validations/auth";
import { parseJsonBody, jsonError, jsonSuccess, handleZodError } from "@/lib/api-helpers";
import { reportError } from "@/lib/observability/report-error";
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/security/rate-limit";
import {
  shouldEnforceAuthCsrfToken,
  startAuthCsrfIssuerProbe,
  validateOrigin,
} from "@/lib/security/csrf";
import { ROLE_DASHBOARD_PATH } from "@/types";
import { logger } from "@/lib/observability/logger";
import type { UserRole } from "@/types";
import { shouldEnforceCompanySsoForProfile } from "@/lib/security/company-sso-enforcement";
import { shouldEnforceOrganisation2FA } from "@/lib/security/org-2fa-enforcement";
import { resolveOauthCompanyFromEmail } from "@/lib/sso/domain";
import {
  clearLoginFailures,
  getLoginLockStatus,
  recordLoginFailure,
} from "@/lib/security/auth-throttle";
import { captureSentryMessage } from "@/lib/observability/sentry";
import { incrementAuthRequestTotal } from "@/lib/observability/auth-csrf-metrics";

function safeAppReturnTo(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return null;
  const pathOnly = t.split("?")[0].split("#")[0];
  if (pathOnly.includes("..")) return null;
  return t;
}

export async function POST(request: NextRequest) {
  incrementAuthRequestTotal("login");
  startAuthCsrfIssuerProbe(request);
  const csrf = validateOrigin(request, { requireToken: shouldEnforceAuthCsrfToken() });
  if (csrf) return csrf;
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const rl = await checkRateLimit({
      key: `auth:${ip}`,
      ...RATE_LIMIT_PRESETS.auth,
    });
    if (!rl.allowed) return jsonError("Too many login attempts. Please wait a minute.", 429);

    const parsedBody = await parseJsonBody(request, "POST /api/auth/login");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = loginSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const { email: rawEmail, password, returnTo: returnToRaw } = parsed.data;
    const email = rawEmail.trim().toLowerCase();
    const lockStatus = await getLoginLockStatus(email);
    if (lockStatus.locked) {
      captureSentryMessage("Auth lockout triggered", "warning", {
        tags: { route: "/api/auth/login", event: "lockout" },
        extra: { emailDomain: email.includes("@") ? email.split("@")[1] : "", ip },
      });
      return jsonError("Too many login attempts. Please wait 30 minutes before trying again.", 429);
    }
    const resolution = await resolveOauthCompanyFromEmail(email);

    // Use the server client (reads cookies) so Supabase sets the session
    // cookie on the response. This is required for the redirect to work.
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      const emailDomain = email.includes("@") ? email.split("@")[1] : "";
      const authCode = (error as { code?: string }).code ?? "";
      logger.error("Login failed", {
        route: "/api/auth/login",
        authErrorCode: authCode,
        authErrorMessage: error.message,
        authErrorStatus: error.status,
        emailDomain,
        ip,
      });

      const failure = await recordLoginFailure(email);
      if (failure.locked) {
        captureSentryMessage("Auth lockout threshold reached", "warning", {
          tags: { route: "/api/auth/login", event: "lockout" },
          extra: { emailDomain, ip, remainingAttempts: failure.remainingAttempts },
        });
        return jsonError(
          "Too many login attempts. Please wait 30 minutes before trying again.",
          429,
        );
      }

      // Do not disclose account existence details.
      const msg = error.message.toLowerCase();
      if (msg.includes("too many requests") || msg.includes("rate limit")) {
        return jsonError(
          "Too many login attempts. Please wait a few minutes before trying again.",
          429,
        );
      }

      return jsonError(
        "Invalid email or password. Please check your credentials. If you just signed up, verify your email using the link we sent before signing in.",
        401,
      );
    }

    await clearLoginFailures(email);

    // Pre-check blocks only when the domain has verified non-password SSO configured.
    // Keep emergency/admin access paths available for password-native company mappings.
    if (resolution.reason === "domain_verified" && resolution.providerType !== "email_password") {
      const admin = createSupabaseAdmin();
      const { data: existingProfile } = await admin
        .from("profiles")
        .select("role, is_platform_admin")
        .eq("id", data.user.id)
        .maybeSingle();
      const role = existingProfile?.role as UserRole | null | undefined;
      const isPlatformAdmin = Boolean(
        (existingProfile as { is_platform_admin?: boolean } | null)?.is_platform_admin,
      );
      if (role !== "super_admin" && !isPlatformAdmin) {
        await supabase.auth.signOut();
        return jsonError(
          "Invalid email or password. Please check your credentials and try again.",
          401,
        );
      }
      if (resolution.companyId) {
        await admin.from("audit_log").insert({
          organisation_id: resolution.companyId,
          actor_user_id: data.user.id,
          actor_email: email,
          event_type: "auth.password.emergency_admin_bypass",
          resource_type: "auth",
          resource_id: data.user.id,
          metadata: {
            role: role ?? null,
            is_platform_admin: isPlatformAdmin,
            provider_type: resolution.providerType ?? null,
          },
        });
      }
    }

    // Use admin client to bypass RLS — ensures profile is always readable/creatable
    const admin = createSupabaseAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("role, organisation_id, full_name")
      .eq("id", data.user.id)
      .single();

    let role: UserRole;
    let fullName: string | null;
    let organisationId: string | null;

    if (profile) {
      role = profile.role as UserRole;
      fullName = profile.full_name;
      organisationId = profile.organisation_id;
    } else {
      // Profile missing (e.g. user created in Supabase Auth but no profile row) — create one
      role = "candidate_free";
      fullName = data.user.user_metadata?.full_name ?? data.user.email?.split("@")[0] ?? null;
      organisationId = null;
      await admin.from("profiles").insert({
        id: data.user.id,
        role,
        full_name: fullName,
      });
      logger.info("Auto-created missing profile on login", {
        userId: data.user.id,
        email: data.user.email,
        role,
      });
    }

    const enforceCompanySso = await shouldEnforceCompanySsoForProfile({ role, organisationId });
    if (enforceCompanySso) {
      await supabase.auth.signOut();
      logger.info("Blocked password login because organisation requires SSO", {
        route: "/api/auth/login",
        userId: data.user.id,
        role,
        organisationId,
      });
      return jsonError(
        "Invalid email or password. Please check your credentials and try again.",
        401,
      );
    }

    const enforce2fa = await shouldEnforceOrganisation2FA(organisationId);
    const aal = (data.session as { aal?: string } | null)?.aal ?? "aal1";
    if (enforce2fa && aal !== "aal2") {
      await supabase.auth.signOut();
      return jsonError("Two-factor authentication is required for this organisation.", 403);
    }

    const returnTo = safeAppReturnTo(returnToRaw);
    const redirectTo = returnTo ?? ROLE_DASHBOARD_PATH[role] ?? "/";

    logger.info("Login successful", {
      userId: data.user.id,
      role,
      ip,
    });

    return jsonSuccess({
      user: {
        id: data.user.id,
        email: data.user.email,
        role,
        fullName,
        organisationId,
      },
      redirectTo,
    });
  } catch (err) {
    reportError(err, { route: "/api/auth/login" });
    return jsonError("Login failed. Please try again.", 500);
  }
}
