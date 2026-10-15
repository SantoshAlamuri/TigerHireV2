import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Public path (/api/health) needs no session, so middleware applies CSP without
// a Supabase round-trip. We still mock the session/cache deps so importing the
// proxy module is side-effect-free.
vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: vi.fn(() =>
    Promise.resolve({
      supabase: { from: vi.fn() },
      user: null,
      supabaseResponse: NextResponse.next(),
    }),
  ),
}));

vi.mock("@/lib/redis/auth-profile-cache", () => ({
  getCachedAuthProfile: vi.fn(() => Promise.resolve(null)),
  setCachedAuthProfile: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/security/finance-route-access", () => ({
  canAccessCompanyFinanceRoute: vi.fn(() => Promise.resolve(false)),
}));

function scriptSrc(csp: string | null): string {
  const directive = (csp ?? "").split(";").find((d) => d.trim().startsWith("script-src"));
  return (directive ?? "").trim();
}

describe("proxy CSP strictness (PII-006)", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("production script-src uses a nonce + strict-dynamic and excludes unsafe-inline", async () => {
    process.env.NODE_ENV = "production";
    const middleware = (await import("@/proxy")).default;
    const res = await middleware(
      new NextRequest("http://localhost:3000/api/health") as unknown as NextRequest,
    );
    const directive = scriptSrc(res.headers.get("content-security-policy"));
    expect(directive).toContain("'nonce-");
    expect(directive).toContain("'strict-dynamic'");
    // The whole point of PII-006: non-HttpOnly session cookies rely on this.
    expect(directive).not.toContain("'unsafe-inline'");
    expect(directive).not.toContain("'unsafe-eval'");
  });
});
