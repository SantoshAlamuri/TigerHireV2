import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/observability/route-span", () => ({
  withRouteSpan: (_name: string, fn: () => Promise<unknown>) => fn(),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: vi.fn(),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  RATE_LIMIT_PRESETS: {
    auth: { limit: 10, windowSecs: 60 },
  },
  buildScopedRateLimitKey: ({ route, userId, organisationId, ip }: any) =>
    `${route}:${organisationId ?? userId ?? ip ?? "anon"}`,
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetAt: new Date(Date.now() + 60_000),
  }),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: vi.fn().mockReturnValue(null),
  shouldEnforceAuthCsrfToken: vi.fn().mockReturnValue(false),
  startAuthCsrfIssuerProbe: vi.fn(),
}));

const mockResolveOauthCompanyFromEmail = vi.fn().mockResolvedValue({
  reason: "domain_not_claimed",
  domain: "example.com",
  companyId: null,
  providerType: null,
});
vi.mock("@/lib/sso/domain", () => ({
  resolveOauthCompanyFromEmail: (...args: unknown[]) => mockResolveOauthCompanyFromEmail(...args),
}));

vi.mock("@/lib/security/company-sso-enforcement", () => ({
  shouldEnforceCompanySsoForProfile: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/security/org-2fa-enforcement", () => ({
  shouldEnforceOrganisation2FA: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/security/auth-throttle", () => ({
  getLoginLockStatus: vi.fn().mockResolvedValue({ locked: false, lockedUntil: null }),
  recordLoginFailure: vi.fn().mockResolvedValue({
    locked: false,
    remainingAttempts: 4,
    lockedUntil: null,
  }),
  clearLoginFailures: vi.fn().mockResolvedValue(undefined),
}));

const authMocks = vi.hoisted(() => ({
  mockSignInWithPassword: vi.fn(),
  mockSignUp: vi.fn(),
  mockProfileSelect: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      signUp: authMocks.mockSignUp,
    },
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      auth: {
        signInWithPassword: authMocks.mockSignInWithPassword,
        signUp: authMocks.mockSignUp,
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: authMocks.mockProfileSelect,
          }),
        }),
      }),
    }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    rpc: vi.fn().mockResolvedValue({ data: "00000000-0000-4000-8000-000000000099", error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({
          single: authMocks.mockProfileSelect,
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
    auth: {
      admin: {
        deleteUser: vi.fn().mockResolvedValue({ error: null }),
      },
    },
  }),
}));

describe("Auth Flows — Functional Tests", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    authMocks.mockSignInWithPassword.mockReset();
    authMocks.mockSignUp.mockReset();
    authMocks.mockProfileSelect.mockReset();
  });

  describe("POST /api/auth/login", () => {
    it("returns 400 for missing email", async () => {
      const { POST } = await import("@/app/api/auth/login/route");
      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "secret123" }),
      });
      const res = await POST(req);
      expect([400, 422]).toContain(res.status);
    });

    it("returns 400 for missing password", async () => {
      const { POST } = await import("@/app/api/auth/login/route");
      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "user@example.com" }),
      });
      const res = await POST(req);
      expect([400, 422]).toContain(res.status);
    });

    it("returns 400 for empty body", async () => {
      const { POST } = await import("@/app/api/auth/login/route");
      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect([400, 422]).toContain(res.status);
    });

    it("returns 400 for invalid email format", async () => {
      const { POST } = await import("@/app/api/auth/login/route");
      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email", password: "secret123" }),
      });
      const res = await POST(req);
      expect([400, 422]).toContain(res.status);
    });

    it("returns 401 for invalid credentials", async () => {
      authMocks.mockSignInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: "Invalid login credentials" },
      });
      const { POST } = await import("@/app/api/auth/login/route");
      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "wrongpassword",
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("returns 200 with user data for valid credentials", async () => {
      authMocks.mockSignInWithPassword.mockResolvedValue({
        data: {
          user: { id: "u1", email: "test@example.com" },
          session: { access_token: "token" },
        },
        error: null,
      });
      authMocks.mockProfileSelect.mockResolvedValue({
        data: {
          role: "leadership",
          organisation_id: "org-1",
          full_name: "Test User",
        },
        error: null,
      });

      const { POST } = await import("@/app/api/auth/login/route");
      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "ValidP@ss1",
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe("test@example.com");
      expect(body.redirectTo).toBeDefined();
    });

    it("returns 429 when rate limited", async () => {
      const { checkRateLimit } = await import("@/lib/security/rate-limit");
      (checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        resetAt: new Date(Date.now() + 60_000),
      });

      const { POST } = await import("@/app/api/auth/login/route");
      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "password123",
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(429);
    });
  });

  describe("POST /api/auth/register", () => {
    it("returns error for password too short", async () => {
      const { POST } = await import("@/app/api/auth/register/route");
      const req = new NextRequest("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "new@example.com",
          password: "123",
          fullName: "Test User",
          userType: "candidate",
        }),
      });
      const res = await POST(req);
      expect([400, 422]).toContain(res.status);
    });

    it("returns error for missing fields", async () => {
      const { POST } = await import("@/app/api/auth/register/route");
      const req = new NextRequest("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect([400, 422]).toContain(res.status);
    });

    it("returns 201 for valid registration", async () => {
      authMocks.mockSignUp.mockResolvedValue({
        data: {
          user: {
            id: "u-new",
            email: "new@example.com",
            identities: [{ id: "id1" }],
          },
          session: { access_token: "token" },
        },
        error: null,
      });

      const { POST } = await import("@/app/api/auth/register/route");
      const req = new NextRequest("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "new@example.com",
          password: "StrongP@ss123",
          fullName: "New User",
          userType: "candidate",
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.user).toBeDefined();
    });
  });
});
