import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthContext = vi.fn();
const mockSignIn = vi.fn();
const mockSignOut = vi.fn();
const mockShouldEnforce2FA = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  parseJsonBody: async (request: Request) => ({ body: await request.json(), errorResponse: null }),
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
  jsonSuccess: (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { status }),
  handleZodError: () => new Response(JSON.stringify({ error: "invalid" }), { status: 422 }),
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => Boolean(ctx),
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  RATE_LIMIT_PRESETS: { auth: { limit: 10, windowSecs: 60 } },
  checkRateLimit: () => Promise.resolve({ allowed: true }),
  buildScopedRateLimitKey: () => "auth:test",
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
  shouldEnforceAuthCsrfToken: () => false,
  startAuthCsrfIssuerProbe: () => undefined,
}));

vi.mock("@/lib/security/company-sso-enforcement", () => ({
  shouldEnforceCompanySsoForProfile: () => Promise.resolve(false),
}));

vi.mock("@/lib/security/org-2fa-enforcement", () => ({
  shouldEnforceOrganisation2FA: (...args: unknown[]) => mockShouldEnforce2FA(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      auth: {
        signInWithPassword: (...args: unknown[]) => mockSignIn(...args),
        signOut: (...args: unknown[]) => mockSignOut(...args),
      },
    }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: { role: "leadership", organisation_id: "org-1", full_name: "Admin" },
            }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/validations/auth", () => ({
  loginSchema: {
    safeParse: (input: unknown) => ({ success: true, data: input }),
  },
}));

vi.mock("@/lib/observability/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/observability/sentry", () => ({ captureSentryMessage: vi.fn() }));
vi.mock("@/lib/sso/domain", () => ({
  resolveOauthCompanyFromEmail: () =>
    Promise.resolve({
      reason: "domain_not_claimed",
      domain: "example.com",
      companyId: null,
      providerType: null,
    }),
}));
vi.mock("@/lib/security/auth-throttle", () => ({
  getLoginLockStatus: () => Promise.resolve({ locked: false }),
  recordLoginFailure: vi.fn(),
  clearLoginFailures: vi.fn(),
}));
vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("POST /api/auth/login 2FA enforcement", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockSignIn.mockReset();
    mockSignOut.mockReset();
    mockShouldEnforce2FA.mockReset();
  });

  it("returns 403 when org requires 2FA and session is aal1", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "anon",
      role: "candidate_free",
      organisationId: null,
    });
    mockShouldEnforce2FA.mockResolvedValue(true);
    mockSignIn.mockResolvedValue({
      data: {
        user: { id: "user-1", email: "admin@example.com", user_metadata: {} },
        session: { aal: "aal1" },
      },
      error: null,
    });

    const { POST } = await import("@/app/api/auth/login/route");
    const req = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "password123" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(String(body.error)).toMatch(/Two-factor authentication is required/i);
  });
});
