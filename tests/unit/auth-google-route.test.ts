import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

let mockEnv: Record<string, string | undefined> = {};

vi.mock("@/lib/config/env", () => ({
  get env() {
    return mockEnv;
  },
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: () => Promise.resolve({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIpForRateLimit: () => "127.0.0.1",
  RATE_LIMIT_PRESETS: {
    auth: { limit: 10, windowSecs: 60 },
    default: { limit: 30, windowSecs: 60 },
  },
}));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      set: vi.fn(),
    }),
}));

describe("GET /api/auth/google", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = { googleClientId: "test-client-id-123", googleClientSecret: "test-secret" };
  });

  it("redirects to /login?error=google_not_configured when googleClientId or secret is missing", async () => {
    mockEnv = { googleClientId: undefined, googleClientSecret: "x" };

    const { GET } = await import("@/app/api/auth/google/route");
    const req = new NextRequest("http://localhost:3000/api/auth/google");
    const res = await GET(req as never);

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("google_not_configured");
  });

  it("redirects to Google OAuth URL with correct client_id", async () => {
    const { GET } = await import("@/app/api/auth/google/route");
    const req = new NextRequest("http://localhost:3000/api/auth/google");
    const res = await GET(req as never);

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.hostname).toBe("accounts.google.com");
    expect(location.pathname).toBe("/o/oauth2/v2/auth");
    expect(location.searchParams.get("client_id")).toBe("test-client-id-123");
  });

  it("includes correct scopes in redirect URL", async () => {
    const { GET } = await import("@/app/api/auth/google/route");
    const req = new NextRequest("http://localhost:3000/api/auth/google");
    const res = await GET(req as never);

    const location = new URL(res.headers.get("location")!);
    const scope = location.searchParams.get("scope")!;
    expect(scope).toContain("openid");
    expect(scope).toContain("userinfo.email");
    expect(scope).toContain("userinfo.profile");
  });

  it("sets redirect_uri to /api/auth/callback/google", async () => {
    const { GET } = await import("@/app/api/auth/google/route");
    const req = new NextRequest("http://localhost:3000/api/auth/google");
    const res = await GET(req as never);

    const location = new URL(res.headers.get("location")!);
    const redirectUri = location.searchParams.get("redirect_uri")!;
    expect(redirectUri).toBe("http://localhost:3000/api/auth/callback/google");
  });

  it("encodes redirect_to in state parameter", async () => {
    const { GET } = await import("@/app/api/auth/google/route");
    const req = new NextRequest("http://localhost:3000/api/auth/google?redirect_to=/dashboard");
    const res = await GET(req as never);

    const location = new URL(res.headers.get("location")!);
    const state = location.searchParams.get("state")!;
    // Decode base64url state
    const decoded = JSON.parse(
      Buffer.from(state.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
    );
    expect(decoded.redirect_to).toBe("/dashboard");
  });

  it("sanitizes absolute redirect_to by stripping origin", async () => {
    const { GET } = await import("@/app/api/auth/google/route");
    const req = new NextRequest(
      "http://localhost:3000/api/auth/google?redirect_to=https://evil.com/steal",
    );
    const res = await GET(req as never);

    const location = new URL(res.headers.get("location")!);
    const state = location.searchParams.get("state")!;
    const decoded = JSON.parse(
      Buffer.from(state.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
    );
    // The origin is stripped, leaving just the path
    expect(decoded.redirect_to).not.toContain("evil.com");
    expect(decoded.redirect_to).toBe("/steal");
  });

  it("defaults redirect_to to / when not provided", async () => {
    const { GET } = await import("@/app/api/auth/google/route");
    const req = new NextRequest("http://localhost:3000/api/auth/google");
    const res = await GET(req as never);

    const location = new URL(res.headers.get("location")!);
    const state = location.searchParams.get("state")!;
    const decoded = JSON.parse(
      Buffer.from(state.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
    );
    expect(decoded.redirect_to).toBe("/");
  });

  it("includes access_type=offline and prompt=consent", async () => {
    const { GET } = await import("@/app/api/auth/google/route");
    const req = new NextRequest("http://localhost:3000/api/auth/google");
    const res = await GET(req as never);

    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("access_type")).toBe("offline");
    expect(location.searchParams.get("prompt")).toBe("consent");
    expect(location.searchParams.get("response_type")).toBe("code");
  });
});
