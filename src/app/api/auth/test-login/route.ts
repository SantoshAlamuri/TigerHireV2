import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { parseJsonBody, jsonError, jsonSuccess } from "@/lib/api-helpers";
import { getVercelEnv } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";
import { getClientIpForRateLimit } from "@/lib/security/rate-limit";
import { ROLE_DASHBOARD_PATH } from "@/types";
import type { UserRole } from "@/types";
import { validateOrigin } from "@/lib/security/csrf";
import { z } from "zod";

/**
 * GET /api/auth/test-login — dev / preview only. Returns { configured: boolean } so the login page can show setup steps.
 * POST /api/auth/test-login — sign in as a test account using SEED_DEMO_PASSWORD (preview) or demo123 (local dev).
 *
 * Gating (security audit Finding B):
 * - Vercel production: always 404, even if SEED_DEMO_PASSWORD is set by mistake.
 * - Local dev (NODE_ENV=development, i.e. localhost): enabled, no extra controls.
 * - Preview / other non-prod deploys: enabled ONLY when `TEST_LOGIN_ENABLED=true`
 *   AND a secondary control is configured + satisfied per request — either a
 *   matching `x-test-login-secret` header (== TEST_LOGIN_SECRET) or a client IP
 *   in TEST_LOGIN_ALLOWED_IPS. Without a secondary control the endpoint refuses.
 */
const DEMO_DEV_PASSWORD = "demo123";
const TEST_LOGIN_SECRET_HEADER = "x-test-login-secret";
const testLoginBodySchema = z
  .object({
    email: z.string().trim().min(1),
  })
  .strict();

function isProduction(): boolean {
  return getVercelEnv() === "production";
}

function isLocalDev(): boolean {
  return process.env.NODE_ENV === "development";
}

function getTestLoginPassword(): string | null {
  if (isProduction()) return null;
  if (process.env.SEED_DEMO_PASSWORD) return process.env.SEED_DEMO_PASSWORD;
  if (isLocalDev()) return DEMO_DEV_PASSWORD;
  return null;
}

/** Flag/env gate — does NOT consider the per-request secondary control. */
function isTestLoginEnabled(): boolean {
  if (isProduction()) return false;
  if (isLocalDev()) return true;
  return process.env.TEST_LOGIN_ENABLED === "true";
}

/** True when at least one preview secondary control is configured. */
function hasSecondaryControlConfigured(): boolean {
  return Boolean(process.env.TEST_LOGIN_SECRET || process.env.TEST_LOGIN_ALLOWED_IPS);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Per-request secondary control. Local dev requires none. On preview, passes
 * when the request supplies a matching secret header OR comes from an
 * allowlisted IP.
 */
function secondaryControlSatisfied(request: NextRequest): boolean {
  if (isLocalDev()) return true;
  const expectedSecret = process.env.TEST_LOGIN_SECRET;
  if (expectedSecret) {
    const provided = request.headers.get(TEST_LOGIN_SECRET_HEADER) ?? "";
    if (timingSafeEqualStr(provided, expectedSecret)) return true;
  }
  const allowedIps = process.env.TEST_LOGIN_ALLOWED_IPS;
  if (allowedIps) {
    const ip = getClientIpForRateLimit(request);
    const list = allowedIps
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ip && list.includes(ip)) return true;
  }
  return false;
}

// Boot-time guard: warn loudly if enabled on a non-prod deploy without a
// secondary control, so an exposed preview never becomes a silent backdoor.
if (!isProduction() && !isLocalDev() && isTestLoginEnabled() && !hasSecondaryControlConfigured()) {
  logger.warn(
    "[test-login] TEST_LOGIN_ENABLED=true on a non-production deploy without TEST_LOGIN_SECRET or TEST_LOGIN_ALLOWED_IPS — endpoint will refuse all requests",
  );
}

export async function GET() {
  if (!isTestLoginEnabled()) {
    return jsonError("Not available", 404);
  }
  // On preview, only report "configured" when a usable secondary control exists.
  const configured =
    Boolean(getTestLoginPassword()) && (isLocalDev() || hasSecondaryControlConfigured());
  return jsonSuccess({ configured });
}

const ALLOWED_TEST_EMAILS = new Set([
  "sam@tigerhire.io",
  "admin@tigerhire.com",
  "nidhi.gupta@finstack.in",
  "rajiv.menon@finstack.in",
  "kavita.rao@finstack.in",
  "meera.nair@finstack.in",
  "lakshmi.interviewer@finstack.in",
  "lakshmi.finance@finstack.in",
  "fatima.sheikh@talentbridge.co",
  "priya.sharma@gmail.com",
  "siddharth.patil@outlook.com",
]);
const PLATFORM_ADMIN_TEST_EMAILS = new Set(["sam@tigerhire.io", "admin@tigerhire.com"]);

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  if (!isTestLoginEnabled()) {
    return jsonError("Not available", 404);
  }
  // Preview deploys must have a secondary control configured and satisfied.
  if (!isLocalDev()) {
    if (!hasSecondaryControlConfigured()) {
      logger.error(
        "[test-login] refused: enabled on preview without TEST_LOGIN_SECRET or TEST_LOGIN_ALLOWED_IPS",
      );
      return jsonError("Not available", 404);
    }
    if (!secondaryControlSatisfied(request)) {
      logger.warn("[test-login] denied: secondary control not satisfied", {
        ip: getClientIpForRateLimit(request),
      });
      return jsonError("Unauthorized", 401);
    }
  }
  const password = getTestLoginPassword();
  if (!password) {
    return jsonError("Test login not configured", 503);
  }
  const parsed = await parseJsonBody<{ email?: string }>(request, "POST /api/auth/test-login");
  if (parsed.errorResponse) return parsed.errorResponse;
  const bodyParsed = testLoginBodySchema.safeParse(parsed.body);
  if (!bodyParsed.success) return jsonError("Invalid request body", 422);
  const email = bodyParsed.data.email.trim().toLowerCase();
  if (!email || !ALLOWED_TEST_EMAILS.has(email)) {
    return jsonError("Invalid test account", 400);
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Supabase not configured";
    if (message.includes("Supabase env vars")) {
      return jsonError(
        "Supabase not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local",
        503,
      );
    }
    return jsonError(message, 500);
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return jsonError("Invalid email or password", 401);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organisation_id, full_name, is_platform_admin")
    .eq("id", data.user.id)
    .single();

  if (PLATFORM_ADMIN_TEST_EMAILS.has(email) && profile?.is_platform_admin !== true) {
    const admin = createSupabaseAdmin();
    await admin.from("profiles").upsert(
      {
        id: data.user.id,
        role: (profile?.role ?? "super_admin") as UserRole,
        organisation_id: profile?.organisation_id ?? null,
        full_name: profile?.full_name ?? "Sam (Super Admin)",
        is_platform_admin: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  }

  const role = (profile?.role ?? "candidate_free") as UserRole;
  const redirectTo = ROLE_DASHBOARD_PATH[role] ?? "/";

  if (!isLocalDev()) {
    logger.info("[test-login] test account signed in", {
      email,
      role,
      privileged: PLATFORM_ADMIN_TEST_EMAILS.has(email),
      env: getVercelEnv(),
    });
  }

  return jsonSuccess({
    user: {
      id: data.user.id,
      email: data.user.email,
      role,
      fullName: profile?.full_name,
      organisationId: profile?.organisation_id,
      isPlatformAdmin: Boolean(
        PLATFORM_ADMIN_TEST_EMAILS.has(email) || profile?.is_platform_admin === true,
      ),
    },
    redirectTo,
  });
}
