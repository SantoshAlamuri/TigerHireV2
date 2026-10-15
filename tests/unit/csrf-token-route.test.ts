import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockIncrementAuthCsrfTokenIssued = vi.fn();
vi.mock("@/lib/observability/auth-csrf-metrics", () => ({
  incrementAuthCsrfTokenIssued: (...args: unknown[]) => mockIncrementAuthCsrfTokenIssued(...args),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: () => Promise.resolve({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIpForRateLimit: () => "127.0.0.1",
  RATE_LIMIT_PRESETS: { default: { limit: 30, windowSecs: 60 } },
}));

describe("GET /api/auth/csrf-token", () => {
  it("increments issuance metric", async () => {
    mockIncrementAuthCsrfTokenIssued.mockReset();
    const { GET } = await import("@/app/api/auth/csrf-token/route");
    const req = new NextRequest("http://localhost:3000/api/auth/csrf-token");
    await GET(req);
    expect(mockIncrementAuthCsrfTokenIssued).toHaveBeenCalledTimes(1);
  });

  it("returns csrf cookie metadata payload", async () => {
    const { GET } = await import("@/app/api/auth/csrf-token/route");
    const req = new NextRequest("http://localhost:3000/api/auth/csrf-token");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    if (typeof body.tokenCookie === "string") {
      expect(body.tokenCookie).toBe("th_csrf_token");
    }
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("th_csrf_token=");
  });
});
