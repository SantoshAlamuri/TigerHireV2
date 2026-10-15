import { NextRequest, NextResponse } from "next/server";
import { shouldEnforceAuthCsrfToken } from "@/lib/security/csrf";
import { getAuthCsrfMetricsSnapshot } from "@/lib/observability/auth-csrf-metrics";

/**
 * GET /api/health/csrf
 * Lightweight health snapshot for auth CSRF rollout state.
 * Use ?probe=1 to verify issuer route reachability from this runtime.
 */
export async function GET(request: NextRequest) {
  const enforceAuthCsrf = shouldEnforceAuthCsrfToken();
  const shouldProbe = request.nextUrl.searchParams.get("probe") === "1";
  const metrics = getAuthCsrfMetricsSnapshot();

  if (!shouldProbe) {
    return NextResponse.json(
      {
        ok: true,
        enforceAuthCsrf,
        issuerPath: "/api/auth/csrf-token",
        metrics,
      },
      { status: 200 },
    );
  }

  const origin = request.nextUrl.origin;
  const probeUrl = `${origin}/api/auth/csrf-token`;
  try {
    const probe = await fetch(probeUrl, {
      method: "GET",
      cache: "no-store",
      headers: { "x-tigerhire-probe": "csrf-health" },
    });
    return NextResponse.json(
      {
        ok: probe.ok,
        enforceAuthCsrf,
        issuerPath: "/api/auth/csrf-token",
        issuerReachable: probe.ok,
        issuerStatus: probe.status,
        metrics,
      },
      { status: probe.ok ? 200 : 503 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        enforceAuthCsrf,
        issuerPath: "/api/auth/csrf-token",
        issuerReachable: false,
        error: error instanceof Error ? error.message : String(error),
        metrics,
      },
      { status: 503 },
    );
  }
}
