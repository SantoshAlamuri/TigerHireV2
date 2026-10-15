import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/security/csrf", () => ({
  shouldEnforceAuthCsrfToken: () => false,
}));
vi.mock("@/lib/observability/auth-csrf-metrics", () => ({
  getAuthCsrfMetricsSnapshot: () => ({
    auth_request_total: { login: 0, register: 0, "forgot-password": 0 },
    auth_csrf_reject_missing_token: { login: 0, register: 0, "forgot-password": 0 },
    auth_csrf_reject_token_mismatch: { login: 0, register: 0, "forgot-password": 0 },
    auth_csrf_token_issued_total: 0,
  }),
}));

describe("GET /api/health/csrf", () => {
  it("returns rollout state without probing by default", async () => {
    const { GET } = await import("@/app/api/health/csrf/route");
    const req = new NextRequest("http://localhost:3000/api/health/csrf");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.enforceAuthCsrf).toBe(false);
    expect(body.metrics).toBeDefined();
    expect(body.metrics.auth_request_total.login).toBe(0);
  });
});
