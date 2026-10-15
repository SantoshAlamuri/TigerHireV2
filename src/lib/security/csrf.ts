import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { logger } from "@/lib/observability/logger";
import {
  incrementAuthCsrfReject,
  toAuthCsrfRouteLabel,
} from "@/lib/observability/auth-csrf-metrics";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/security/csrf-constants";
import { addOriginVariants } from "@/lib/security/csrf-allowed-origins";
import { getTryoutAllowedOrigins } from "@/lib/security/cors";
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
let authCsrfIssuerProbeStarted = false;

interface ValidateOriginOptions {
  requireToken?: boolean;
}

function getRequestCookieToken(request: NextRequest): string | null {
  return request.cookies.get(CSRF_COOKIE_NAME)?.value ?? null;
}

function getRequestHeaderToken(request: NextRequest): string | null {
  return request.headers.get(CSRF_HEADER_NAME) ?? null;
}

function generateCsrfToken(): string {
  return randomUUID().replace(/-/g, "");
}

/**
 * Ensures a CSRF cookie token is present on the response.
 * Double-submit clients should echo this value via `x-csrf-token`.
 */
export function attachCsrfToken(response: NextResponse, request: NextRequest): NextResponse {
  const existing = getRequestCookieToken(request);
  const value = existing ?? generateCsrfToken();
  response.cookies.set({
    name: CSRF_COOKIE_NAME,
    value,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    httpOnly: false,
  });
  return response;
}

/**
 * Feature flag for phased rollout of auth-route double-submit CSRF checks.
 * Set CSRF_DOUBLE_SUBMIT_ENFORCE_AUTH=true in environment to enforce.
 */
export function shouldEnforceAuthCsrfToken(): boolean {
  const raw = (process.env.CSRF_DOUBLE_SUBMIT_ENFORCE_AUTH ?? "").trim().toLowerCase();
  return TRUE_VALUES.has(raw);
}

function getAppOrigin(request?: NextRequest): string | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
  if (appUrl) {
    try {
      return appUrl.startsWith("http") ? new URL(appUrl).origin : `https://${appUrl}`;
    } catch {
      // fall through to request origin
    }
  }
  if (request) {
    try {
      return new URL(request.url).origin;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Starts a once-per-instance probe when auth CSRF enforcement is enabled.
 * This catches misconfigured deployments where issuer route is unavailable.
 */
export function startAuthCsrfIssuerProbe(request?: NextRequest): void {
  if (!shouldEnforceAuthCsrfToken() || authCsrfIssuerProbeStarted) return;
  authCsrfIssuerProbeStarted = true;
  const origin = getAppOrigin(request);
  if (!origin) {
    logger.warn("CSRF enforcement enabled but issuer probe origin is unavailable", {
      route: "auth-csrf-boot-probe",
    });
    return;
  }
  const probeUrl = `${origin}/api/auth/csrf-token`;
  void fetch(probeUrl, {
    method: "GET",
    cache: "no-store",
    headers: { "x-tigerhire-probe": "csrf-issuer" },
  })
    .then((res) => {
      if (!res.ok) {
        logger.warn("CSRF issuer probe failed", {
          route: "auth-csrf-boot-probe",
          status: res.status,
          url: probeUrl,
        });
      } else {
        logger.info("CSRF issuer probe passed", {
          route: "auth-csrf-boot-probe",
          url: probeUrl,
        });
      }
    })
    .catch((error) => {
      logger.warn("CSRF issuer probe request failed", {
        route: "auth-csrf-boot-probe",
        url: probeUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    });
}

/**
 * Validates Origin/Referer for state-changing requests to mitigate CSRF.
 * Call at the start of POST/PUT/PATCH/DELETE handlers (route-level guard).
 *
 * NOTE: The middleware in proxy.ts also performs centralized CSRF validation for
 * all /api/* mutating requests. This per-route helper is retained as defence-in-depth
 * for routes that need it explicitly and can be removed from individual routes over time.
 *
 * Allowed origins:
 *  - NEXT_PUBLIC_APP_URL (or VERCEL_URL)
 *  - The request URL's own origin (same-origin requests from preview deployments)
 */
export function validateOrigin(
  request: NextRequest,
  options: ValidateOriginOptions = {},
): NextResponse | null {
  if (process.env.NODE_ENV !== "production") return null;

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
  // Fail-closed: if no app URL is configured in production, reject cross-origin
  // requests rather than allowing everything. Same-origin requests (where
  // Origin matches the request URL) are still allowed via requestOrigin below.
  if (!appUrl) {
    const reqOrigin = (() => {
      try {
        return new URL(request.url).origin;
      } catch {
        return null;
      }
    })();
    const origin = request.headers.get("origin");
    if (origin && reqOrigin && origin !== reqOrigin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return null;
  }

  const allowedOrigin = appUrl.startsWith("http") ? new URL(appUrl).origin : `https://${appUrl}`;

  const allowed = new Set<string>();
  addOriginVariants(allowed, allowedOrigin);
  try {
    addOriginVariants(allowed, new URL(request.url).origin);
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

  if (options.requireToken) {
    const cookieToken = getRequestCookieToken(request);
    const headerToken = getRequestHeaderToken(request);
    if (!cookieToken || !headerToken) {
      const routeLabel = toAuthCsrfRouteLabel(request.nextUrl.pathname);
      if (routeLabel) {
        incrementAuthCsrfReject(routeLabel, "missing_csrf_token");
      }
      logger.warn("CSRF enforcement rejected request", {
        route: request.nextUrl.pathname,
        reason: "missing_csrf_token",
        user_agent: request.headers.get("user-agent") ?? "unknown",
      });
      return NextResponse.json({ error: "Forbidden (invalid CSRF token)" }, { status: 403 });
    }
    if (cookieToken !== headerToken) {
      const routeLabel = toAuthCsrfRouteLabel(request.nextUrl.pathname);
      if (routeLabel) {
        incrementAuthCsrfReject(routeLabel, "token_mismatch");
      }
      logger.warn("CSRF enforcement rejected request", {
        route: request.nextUrl.pathname,
        reason: "token_mismatch",
        user_agent: request.headers.get("user-agent") ?? "unknown",
      });
      return NextResponse.json({ error: "Forbidden (invalid CSRF token)" }, { status: 403 });
    }
  }

  return null;
}
