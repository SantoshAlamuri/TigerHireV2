import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@/types";
import { ROLE_DASHBOARD_PATH } from "@/types";
import { updateSession } from "@/lib/supabase/middleware";
import { SUPABASE_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { getCachedAuthProfile, setCachedAuthProfile } from "@/lib/redis/auth-profile-cache";
import { logger } from "@/lib/observability/logger";
import { addSentryBreadcrumb, setSentryRequestContext } from "@/lib/observability/sentry";
import { canAccessCompanyFinanceRoute } from "@/lib/security/finance-route-access";
import { resolveApiAccountStatus } from "@/lib/security/api-account-status";
import {
  DASHBOARD_MIDDLEWARE_PROTECTED_PREFIXES,
  matchesDashboardPrefix,
  matchesSetupPrefix,
  resolveDashboardRouteAccessRule,
  shouldRedirectNonOrgAdminFromOrgConfigPath,
} from "@/lib/security/dashboard-route-policy";
import { addOriginVariants } from "@/lib/security/csrf-allowed-origins";
import { getTryoutAllowedOrigins } from "@/lib/security/cors";
import {
  COMPANY_PENDING_ACTIVATION_PATH,
  companyActivationShouldBlockDashboardPath,
  companyOrganisationApiActivationDenied,
  isCompanyOrganisationPendingActivation,
} from "@/lib/security/company-org-activation";

const CSP_HEADER = "Content-Security-Policy";
const NONCE_HEADER = "x-nonce";

/**
 * API path prefixes that do not require an authenticated session.
 * Legacy candidate/referrer auth/session routes are decommissioned; old public pages now redirect
 * via Next.js route/page redirects (see next.config.ts and public page server redirects).
 */
const API_PUBLIC_PREFIXES = [
  "/api/auth/",
  "/api/webhooks/",
  "/api/cron/",
  // Inngest cloud sync/invoke: authenticated via INNGEST_SIGNING_KEY in the serve() handler, not user session.
  "/api/inngest",
  "/api/signals/ingest",
  "/api/invites/",
  // Consultant (agency) invite: GET is readable pre-auth so the accept page can
  // render; the POST that actually links the firm enforces auth in the route.
  "/api/consultant-invites/",
  "/api/public/",
  "/api/jobs/public",
  "/api/apply",
  "/api/refer/otp/send",
  "/api/offers/public/",
  "/api/schedule/self-serve/",
  "/api/approvals/action/",
  "/api/refer/jobs/open",
  "/api/health",
  "/api/waitlist",
  "/api/contact",
  "/api/openapi",
  "/api/intake/email",
  "/api/screening/voice/webhook",
  "/api/tryout/",
  ...(process.env.NODE_ENV === "development" ? ["/api/debug"] : []),
];
const API_PUBLIC_PATTERN = /^\/api\/jobs\/[^/]+\/public$/;

/**
 * Returns true if this API path does not require a session (proxy allows through without 401).
 * Prefixes that already end with "/" (e.g. "/api/auth/") must not use p + "/" or we get
 * "/api/auth//" and paths like /api/auth/sso would not match. We use pathname.startsWith(prefix)
 * with prefix = p when p ends with "/", else p + "/".
 */
function isPublicApiPath(pathname: string): boolean {
  if (!pathname.startsWith("/api/")) return true;
  if (API_PUBLIC_PATTERN.test(pathname)) return true;
  return API_PUBLIC_PREFIXES.some((p) => {
    const prefix = p.endsWith("/") ? p : p + "/";
    return pathname === p || pathname.startsWith(prefix);
  });
}

/**
 * When Supabase uses a custom API domain (e.g. api.tigerhire.io), browser fetches go to that
 * origin — they are not covered by https://*.supabase.co. Append matching http(s)/ws(s) origins.
 */
function supabaseCustomConnectSrc(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return "";
  try {
    const u = new URL(raw);
    const host = u.host;
    if (!host || host.endsWith(".supabase.co")) return "";
    const isHttp = u.protocol === "http:";
    return ` ${isHttp ? "http" : "https"}://${host} ${isHttp ? "ws" : "wss"}://${host}`;
  } catch {
    return "";
  }
}

function generateNonce(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID && typeof Buffer !== "undefined") {
      return Buffer.from(crypto.randomUUID())
        .toString("base64")
        .replace(/[^a-zA-Z0-9]/g, "");
    }
  } catch {
    // Buffer not available (e.g. Edge)
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  }
  const binary = String.fromCharCode(...bytes);
  return typeof btoa !== "undefined" ? btoa(binary).replace(/[^a-zA-Z0-9]/g, "") : "fallback";
}

function applyCspAndCookies(
  supabaseResponse: NextResponse,
  request: NextRequest,
  requestId: string,
): NextResponse {
  const nonce = generateNonce();
  // Nonce is set on the request so Next.js can apply it to inline scripts during render.
  // 'strict-dynamic' allows scripts loaded by trusted scripts; no 'unsafe-inline'.
  const isDev = process.env.NODE_ENV === "development";
  const supabaseConnectExtra = supabaseCustomConnectSrc();
  // PII-006: Supabase auth cookies are non-HttpOnly (see cookie-options.ts), so
  // production script-src MUST stay nonce-based with NO 'unsafe-inline' — that
  // is the compensating control against XSS session-token theft. Keep it strict;
  // tests/unit/proxy-csp.test.ts asserts this and will fail if it regresses.
  const csp = [
    "default-src 'self'",
    isDev
      ? `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://vercel.live`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    isDev
      ? `connect-src 'self' https://*.supabase.co wss://*.supabase.co${supabaseConnectExtra} https://*.sentry.io https://*.i.posthog.com wss://*.i.posthog.com https://us-assets.i.posthog.com https://eu-assets.i.posthog.com https://vercel.live`
      : `connect-src 'self' https://*.supabase.co wss://*.supabase.co${supabaseConnectExtra} https://*.sentry.io https://*.i.posthog.com wss://*.i.posthog.com https://us-assets.i.posthog.com https://eu-assets.i.posthog.com https://vercel.live`,
    "frame-src 'self' https://vercel.live",
    "frame-ancestors 'none'",
  ].join("; ");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set(CSP_HEADER, csp);
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set(CSP_HEADER, csp);
  response.headers.set("x-request-id", requestId);
  // Preserve Supabase cookie headers (expires, maxAge, path, etc.) instead of replacing with only SUPABASE_COOKIE_OPTIONS.
  const setCookieHeaders =
    typeof supabaseResponse.headers.getSetCookie === "function"
      ? supabaseResponse.headers.getSetCookie()
      : [];
  if (setCookieHeaders.length > 0) {
    for (const cookieHeader of setCookieHeaders) {
      response.headers.append("Set-Cookie", cookieHeader);
    }
  } else {
    // Fallback if getSetCookie is not available: set name/value with shared options (may lose expiration).
    supabaseResponse.cookies
      .getAll()
      .forEach((c) => response.cookies.set(c.name, c.value, SUPABASE_COOKIE_OPTIONS));
  }
  return response;
}

const PROTECTED_PREFIXES = DASHBOARD_MIDDLEWARE_PROTECTED_PREFIXES;

function addRequestId(request: NextRequest): {
  requestId: string;
  requestWithId: NextRequest;
} {
  const requestId = crypto.randomUUID();
  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  return {
    requestId,
    requestWithId: new NextRequest(request.url, { headers }),
  };
}

/** Mutating HTTP methods that require CSRF origin validation. */
const CSRF_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** API prefixes exempt from CSRF because they receive traffic from external services, not browsers. */
const CSRF_EXEMPT_PREFIXES = [
  "/api/webhooks/",
  "/api/cron/",
  "/api/signals/ingest",
  "/api/auth/callback",
];

function checkCsrfOrigin(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV !== "production") return null;
  if (!CSRF_METHODS.has(request.method)) return null;

  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/api/")) return null;
  if (CSRF_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;

  const allowed = new Set<string>();
  // When APP_URL is unset (self-hosted / misconfigured deploy) do NOT fail open —
  // fall back to enforcing same-origin against the request's own origin, matching
  // the route-level helper. A missing APP_URL must not disable CSRF for every
  // API mutation.
  if (appUrl) {
    const allowedOrigin = appUrl.startsWith("http") ? new URL(appUrl).origin : `https://${appUrl}`;
    addOriginVariants(allowed, allowedOrigin);
  }
  try {
    const reqOrigin = new URL(request.url).origin;
    addOriginVariants(allowed, reqOrigin);
  } catch {
    /* ignore */
  }
  for (const tryoutOrigin of getTryoutAllowedOrigins()) {
    allowed.add(tryoutOrigin);
  }

  if (origin && !allowed.has(origin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!origin && referer) {
    try {
      if (!allowed.has(new URL(referer).origin)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  return null;
}

/** Auth callback has no session yet (code exchange happens in the route). Skip session lookup to avoid an extra Supabase round-trip and speed up OAuth redirect. */
const AUTH_CALLBACK_PREFIX = "/api/auth/callback";

/** Paths proxied to Supabase via next.config rewrites — skip middleware entirely so rewrites handle them. */
const SUPABASE_REWRITE_PREFIXES = ["/auth/", "/rest/", "/realtime", "/storage/", "/functions/v1/"];

export default async function middleware(request: NextRequest) {
  const { requestId, requestWithId } = addRequestId(request);
  const { pathname } = requestWithId.nextUrl;
  const startedAt = Date.now();
  let finalStatus = 500;
  let observedUserId: string | undefined;
  const finish = <T extends NextResponse | Response>(res: T): T => {
    finalStatus = res.status;
    return res;
  };

  // Supabase proxy rewrites: let next.config rewrites handle these paths without middleware interference.
  if (SUPABASE_REWRITE_PREFIXES.some((p) => pathname.startsWith(p))) {
    return finish(NextResponse.next());
  }

  // Centralized CSRF: reject cross-origin mutating API requests early.
  const csrfBlock = checkCsrfOrigin(requestWithId);
  if (csrfBlock) {
    csrfBlock.headers.set("x-request-id", requestId);
    return csrfBlock;
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => matchesDashboardPrefix(pathname, p));
  const isApi = pathname.startsWith("/api/");
  const needsSession = isProtected || (isApi && !isPublicApiPath(pathname));

  try {
    // Skip Supabase session lookup for OAuth callback — no session cookie yet; route will exchange code and set cookies.
    if (pathname.startsWith(AUTH_CALLBACK_PREFIX)) {
      const nextRes = NextResponse.next({ request: requestWithId });
      return finish(applyCspAndCookies(nextRes, requestWithId, requestId));
    }

    // Skip Supabase (and Redis/DB) for public routes — huge latency win (avoids 1–2 round-trips per request).
    if (!needsSession) {
      return finish(applyCspAndCookies(NextResponse.next(), requestWithId, requestId));
    }

    const { supabase, user, supabaseResponse } = await updateSession(requestWithId);
    observedUserId = user?.id;

    // Centralized API auth gate: non-public /api/* requires a session
    if (pathname.startsWith("/api/")) {
      if (!isPublicApiPath(pathname) && !user) {
        const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        res.headers.set("x-request-id", requestId);
        return finish(res);
      }
      if (user && !isPublicApiPath(pathname)) {
        // Centralized account-status gate: deny suspended / pending / inactive
        // accounts at the middleware so a protected API can't be reached even
        // if the route forgets to call getAuthContext() (audit Finding C).
        // Resolve the profile once and reuse it for the activation gate below
        // (avoids a second getCachedAuthProfile read per API request).
        const { denyReason, profile } = await resolveApiAccountStatus(supabase, user.id);
        if (denyReason) {
          logger.warn("API blocked: account status", {
            pathname,
            reason: denyReason,
            user_id: user.id,
          });
          const res = NextResponse.json(
            { error: "Account is not active", code: `account_${denyReason}` },
            { status: 403 },
          );
          res.headers.set("x-request-id", requestId);
          return finish(res);
        }
        const denied = await companyOrganisationApiActivationDenied(
          supabase,
          user.id,
          pathname,
          profile,
        );
        if (denied) {
          const res = NextResponse.json(
            {
              error:
                "Your organisation is pending activation by TigerHire. You cannot use this feature until activation is complete.",
              code: "company_activation_pending",
            },
            { status: 403 },
          );
          res.headers.set("x-request-id", requestId);
          return finish(res);
        }
      }
      return finish(applyCspAndCookies(supabaseResponse, requestWithId, requestId));
    }

    if (!isProtected) {
      return finish(applyCspAndCookies(supabaseResponse, requestWithId, requestId));
    }

    return finish(
      await runProtectedMiddleware(
        requestWithId,
        requestId,
        pathname,
        supabase,
        user,
        supabaseResponse,
        applyCspAndCookies,
      ),
    );
  } catch (err) {
    logger.error("Middleware error", {
      error: err instanceof Error ? err.message : String(err),
      pathname,
    });

    if (isProtected) {
      const url = requestWithId.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      const res = NextResponse.redirect(url);
      res.headers.set("x-request-id", requestId);
      return finish(res);
    }

    const res = NextResponse.next({ request: requestWithId });
    res.headers.set("x-request-id", requestId);
    return finish(res);
  } finally {
    if (!pathname.startsWith("/_next/") && pathname !== "/favicon.ico") {
      const durationMs = Date.now() - startedAt;
      const status = finalStatus;
      logger.info("request_latency", {
        path: pathname,
        method: requestWithId.method,
        status,
        duration_ms: durationMs,
        request_id: requestId,
        user_id: observedUserId,
      });
      if (pathname.startsWith("/api/")) {
        setSentryRequestContext({
          route: pathname,
          userId: observedUserId,
        });
        addSentryBreadcrumb({
          category: "api.request",
          message: `${requestWithId.method} ${pathname}`,
          level: "info",
          data: {
            route: pathname,
            user_id: observedUserId ?? null,
            status,
            duration_ms: durationMs,
          },
        });
      }
    }
  }
}

async function runProtectedMiddleware(
  request: NextRequest,
  requestId: string,
  pathname: string,
  supabase: Awaited<ReturnType<typeof updateSession>>["supabase"],
  user: Awaited<ReturnType<typeof updateSession>>["user"],
  supabaseResponse: NextResponse,
  applyCsp: (r: NextResponse, req: NextRequest, id: string) => NextResponse,
) {
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    const res = NextResponse.redirect(url);
    res.headers.set("x-request-id", requestId);
    res.headers.set(CSP_HEADER, "default-src 'self'");
    return res;
  }

  let role: UserRole | null = null;
  let roleStatus: "pending" | "active" | "suspended" = "active";
  let organisationId: string | null = null;
  let isOrgAdmin = false;
  const cached = await getCachedAuthProfile(user.id);
  if (cached?.is_active === false) {
    role = null;
    roleStatus = cached.role_status ?? "active";
  } else if (cached) {
    role = cached.role;
    roleStatus = cached.role_status ?? "active";
    organisationId = cached.organisation_id ?? null;
    isOrgAdmin = Boolean(cached.is_org_admin);
  } else {
    let profile: {
      role: UserRole;
      organisation_id: string | null;
      is_active: boolean;
      role_status: "pending" | "active" | "suspended";
      is_org_admin: boolean;
      is_platform_admin: boolean;
    } | null = null;

    // Must stay a superset of what getAuthContext() caches: this write shares the
    // auth-profile cache, and any field omitted here is silently `false` for every
    // cache hit during the TTL (this exact bug 403'd platform-admin panels in prod).
    const profileSelect =
      "role, organisation_id, is_active, role_status, is_org_admin, is_platform_admin";
    const { data: profileWithActive, error: profileWithActiveError } = await supabase
      .from("profiles")
      .select(profileSelect)
      .eq("id", user.id)
      .single();

    if (profileWithActiveError?.message?.includes("column profiles.is_active does not exist")) {
      const { data: profileLegacy } = await supabase
        .from("profiles")
        .select("role, organisation_id")
        .eq("id", user.id)
        .single();
      profile = profileLegacy
        ? {
            role: profileLegacy.role as UserRole,
            organisation_id: profileLegacy.organisation_id ?? null,
            is_active: true,
            role_status: "active",
            is_org_admin: false,
            is_platform_admin: false,
          }
        : null;
    } else if (
      profileWithActiveError?.message?.includes("column profiles.is_org_admin does not exist")
    ) {
      const { data: profileNoOrgAdmin } = await supabase
        .from("profiles")
        .select("role, organisation_id, is_active, role_status, is_platform_admin")
        .eq("id", user.id)
        .single();
      profile = profileNoOrgAdmin
        ? {
            role: profileNoOrgAdmin.role as UserRole,
            organisation_id: profileNoOrgAdmin.organisation_id ?? null,
            is_active: Boolean(profileNoOrgAdmin.is_active),
            role_status:
              (profileNoOrgAdmin.role_status as "pending" | "active" | "suspended") ?? "active",
            is_org_admin: false,
            is_platform_admin: Boolean(
              (profileNoOrgAdmin as { is_platform_admin?: boolean }).is_platform_admin ?? false,
            ),
          }
        : null;
    } else {
      profile = profileWithActive
        ? {
            role: profileWithActive.role as UserRole,
            organisation_id: profileWithActive.organisation_id ?? null,
            is_active: Boolean(profileWithActive.is_active),
            role_status:
              (profileWithActive.role_status as "pending" | "active" | "suspended") ?? "active",
            is_org_admin: Boolean(
              (profileWithActive as { is_org_admin?: boolean }).is_org_admin ?? false,
            ),
            is_platform_admin: Boolean(
              (profileWithActive as { is_platform_admin?: boolean }).is_platform_admin ?? false,
            ),
          }
        : null;
    }
    if (profile && profile.is_active) {
      role = profile.role as UserRole;
      roleStatus = profile.role_status;
      organisationId = profile.organisation_id ?? null;
      isOrgAdmin = profile.is_org_admin;
      await setCachedAuthProfile(user.id, {
        role: profile.role as UserRole,
        organisation_id: profile.organisation_id ?? null,
        is_active: Boolean(profile.is_active),
        role_status: profile.role_status,
        is_org_admin: profile.is_org_admin,
        is_platform_admin: profile.is_platform_admin,
      });
    }
  }

  if (roleStatus === "pending") {
    const url = request.nextUrl.clone();
    url.pathname = "/awaiting-approval";
    const res = NextResponse.redirect(url);
    res.headers.set("x-request-id", requestId);
    return res;
  }

  if (roleStatus === "suspended") {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/no-access";
    url.searchParams.set("reason", "account_suspended");
    const res = NextResponse.redirect(url);
    res.headers.set("x-request-id", requestId);
    return res;
  }

  if (!role) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const res = NextResponse.redirect(url);
    res.headers.set("x-request-id", requestId);
    return res;
  }

  if (organisationId) {
    const activationPending = await isCompanyOrganisationPendingActivation(
      supabase,
      organisationId,
    );
    if (activationPending && companyActivationShouldBlockDashboardPath(role, pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = COMPANY_PENDING_ACTIVATION_PATH;
      const res = NextResponse.redirect(url);
      res.headers.set("x-request-id", requestId);
      return res;
    }
  }

  if (role === "employee" && (pathname === "/home" || pathname === "/home/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/employee";
    const res = NextResponse.redirect(url);
    res.headers.set("x-request-id", requestId);
    return res;
  }

  const routeRule = resolveDashboardRouteAccessRule(pathname);
  if (routeRule) {
    if (routeRule.prefix === "/company/finance") {
      const financeBase: UserRole[] = ["finance", "leadership", "super_admin"];
      if (financeBase.includes(role)) {
        /* allowed */
      } else if (role === "recruiter" || role === "hiring_manager") {
        const enterpriseOk = await canAccessCompanyFinanceRoute(user.id, role, supabase);
        if (!enterpriseOk) {
          const url = request.nextUrl.clone();
          url.pathname = ROLE_DASHBOARD_PATH[role];
          const res = NextResponse.redirect(url);
          res.headers.set("x-request-id", requestId);
          return res;
        }
      } else {
        const url = request.nextUrl.clone();
        url.pathname = ROLE_DASHBOARD_PATH[role];
        const res = NextResponse.redirect(url);
        res.headers.set("x-request-id", requestId);
        return res;
      }
    } else if (!routeRule.roles.includes(role)) {
      const url = request.nextUrl.clone();
      url.pathname = ROLE_DASHBOARD_PATH[role];
      const res = NextResponse.redirect(url);
      res.headers.set("x-request-id", requestId);
      return res;
    }
  }

  if (matchesSetupPrefix(pathname) && !isOrgAdmin) {
    // Every other denial above redirects to the caller's own dashboard. This
    // branch used to return a bare unstyled "Forbidden" body — no nav, no way
    // back — which a recruiter could reach from their own settings links.
    // Deny consistently instead of stranding them on a white page.
    const url = request.nextUrl.clone();
    url.pathname = ROLE_DASHBOARD_PATH[role];
    url.search = "";
    const res = NextResponse.redirect(url);
    res.headers.set("x-request-id", requestId);
    return res;
  }
  if (shouldRedirectNonOrgAdminFromOrgConfigPath(pathname, isOrgAdmin, role)) {
    const url = request.nextUrl.clone();
    url.pathname = ROLE_DASHBOARD_PATH[role];
    const res = NextResponse.redirect(url);
    res.headers.set("x-request-id", requestId);
    return res;
  }

  return applyCsp(supabaseResponse, request, requestId);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_next/webpack-hmr|monitoring|favicon.ico|icon|manifest.json|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
