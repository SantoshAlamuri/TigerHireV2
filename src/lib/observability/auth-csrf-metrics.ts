import { logger } from "@/lib/observability/logger";

export type AuthCsrfRouteLabel = "login" | "register" | "forgot-password";
export type CsrfRejectReason = "missing_csrf_token" | "token_mismatch";

type RouteCounters = Record<AuthCsrfRouteLabel, number>;

function createRouteCounters(): RouteCounters {
  return {
    login: 0,
    register: 0,
    "forgot-password": 0,
  };
}

const counters = {
  auth_request_total: createRouteCounters(),
  auth_csrf_reject_missing_token: createRouteCounters(),
  auth_csrf_reject_token_mismatch: createRouteCounters(),
  auth_csrf_token_issued_total: 0,
};

function emitCounterLog(metric: string, labels: Record<string, string>, value = 1): void {
  logger.info("metric.counter", { metric, labels, value });
}

export function incrementAuthRequestTotal(route: AuthCsrfRouteLabel): void {
  counters.auth_request_total[route] += 1;
  emitCounterLog("auth_request_total", { route });
}

export function incrementAuthCsrfReject(route: AuthCsrfRouteLabel, reason: CsrfRejectReason): void {
  if (reason === "missing_csrf_token") {
    counters.auth_csrf_reject_missing_token[route] += 1;
    emitCounterLog("auth_csrf_reject_missing_token", { route, reason });
    return;
  }
  counters.auth_csrf_reject_token_mismatch[route] += 1;
  emitCounterLog("auth_csrf_reject_token_mismatch", { route, reason });
}

export function incrementAuthCsrfTokenIssued(): void {
  counters.auth_csrf_token_issued_total += 1;
  emitCounterLog("auth_csrf_token_issued_total", { route: "csrf-token" });
}

export function getAuthCsrfMetricsSnapshot() {
  return {
    auth_request_total: { ...counters.auth_request_total },
    auth_csrf_reject_missing_token: { ...counters.auth_csrf_reject_missing_token },
    auth_csrf_reject_token_mismatch: { ...counters.auth_csrf_reject_token_mismatch },
    auth_csrf_token_issued_total: counters.auth_csrf_token_issued_total,
  };
}

export function toAuthCsrfRouteLabel(pathname: string): AuthCsrfRouteLabel | null {
  if (pathname.endsWith("/api/auth/login")) return "login";
  if (pathname.endsWith("/api/auth/register")) return "register";
  if (pathname.endsWith("/api/auth/forgot-password")) return "forgot-password";
  return null;
}
