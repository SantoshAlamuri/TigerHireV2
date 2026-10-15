import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
  shouldEnforceAuthCsrfToken: () => false,
  startAuthCsrfIssuerProbe: () => undefined,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  RATE_LIMIT_PRESETS: {
    auth: { limit: 10, windowSecs: 60 },
  },
  checkRateLimit: () => Promise.resolve({ allowed: true, remaining: 10, resetAt: new Date() }),
}));
const mockGetLoginLockStatus = vi.fn();
const mockRecordLoginFailure = vi.fn();
const mockClearLoginFailures = vi.fn();
vi.mock("@/lib/security/auth-throttle", () => ({
  getLoginLockStatus: (...args: unknown[]) => mockGetLoginLockStatus(...args),
  recordLoginFailure: (...args: unknown[]) => mockRecordLoginFailure(...args),
  clearLoginFailures: (...args: unknown[]) => mockClearLoginFailures(...args),
}));

const mockSignIn = vi.fn();
const mockSignOut = vi.fn();
const mockAdminFrom = vi.fn();
const mockResolveOauthCompanyFromEmail = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      auth: {
        signInWithPassword: mockSignIn,
        signOut: mockSignOut,
        getUser: vi.fn(),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: {
                  role: "candidate_free",
                  organisation_id: "org-1",
                  full_name: "Test User",
                },
              }),
          }),
        }),
      }),
    }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: (...args: unknown[]) => mockAdminFrom(...args) }),
}));
vi.mock("@/lib/sso/domain", () => ({
  resolveOauthCompanyFromEmail: (...args: unknown[]) => mockResolveOauthCompanyFromEmail(...args),
}));
vi.mock("@/lib/security/org-2fa-enforcement", () => ({
  shouldEnforceOrganisation2FA: () => Promise.resolve(false),
}));

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSignIn.mockReset();
    mockSignOut.mockReset();
    mockAdminFrom.mockReset();
    mockResolveOauthCompanyFromEmail.mockReset();
    mockResolveOauthCompanyFromEmail.mockResolvedValue({
      reason: "domain_not_claimed",
      domain: "example.com",
      companyId: null,
      providerType: null,
    });
    mockGetLoginLockStatus.mockResolvedValue({ locked: false, lockedUntil: null });
    mockRecordLoginFailure.mockResolvedValue({
      locked: false,
      remainingAttempts: 4,
      lockedUntil: null,
    });
    mockClearLoginFailures.mockResolvedValue(undefined);
  });

  it("returns 422 for invalid body (missing email)", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "password123" }),
    });
    const response = await POST(request as any);
    expect(response.status).toBe(422);
  }, 10000);

  it("returns 401 for invalid credentials even with short password", async () => {
    const adminBuilder = {
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null }),
        }),
      }),
    };
    mockAdminFrom.mockReturnValue(adminBuilder);
    mockSignIn.mockResolvedValue({
      data: null,
      error: { message: "Invalid credentials" },
    });
    const { POST } = await import("@/app/api/auth/login/route");
    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "short" }),
    });
    const response = await POST(request as any);
    expect(response.status).toBe(401);
  });

  it("returns generic invalid credentials for verified SSO domains", async () => {
    mockResolveOauthCompanyFromEmail.mockResolvedValue({
      reason: "domain_verified",
      domain: "acme.com",
      companyId: "org-1",
      providerType: "google",
    });
    mockAdminFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: { role: "leadership", is_platform_admin: false },
            }),
        }),
      }),
    });
    mockSignIn.mockResolvedValue({
      data: {
        user: { id: "blocked-user-1", email: "user@acme.com" },
      },
      error: null,
    });
    const { POST } = await import("@/app/api/auth/login/route");
    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@acme.com", password: "password123" }),
    });
    const response = await POST(request as any);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain("Invalid email or password");
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("allows password login when verified mapping is email_password", async () => {
    mockResolveOauthCompanyFromEmail.mockResolvedValue({
      reason: "domain_verified",
      domain: "acme.com",
      companyId: "org-1",
      providerType: "email_password",
    });
    const adminBuilder = {
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: {
                role: "candidate_free",
                organisation_id: null,
                full_name: "Test User",
              },
            }),
        }),
      }),
    };
    mockAdminFrom.mockReturnValue(adminBuilder);
    mockSignIn.mockResolvedValue({
      data: { user: { id: "user-1", email: "u@example.com" } },
      error: null,
    });
    const { POST } = await import("@/app/api/auth/login/route");
    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@acme.com", password: "password123" }),
    });
    const response = await POST(request as any);
    expect(response.status).toBe(200);
  });

  it("allows super_admin emergency password access on verified SSO domain", async () => {
    mockResolveOauthCompanyFromEmail.mockResolvedValue({
      reason: "domain_verified",
      domain: "acme.com",
      companyId: "org-1",
      providerType: "google",
    });
    let call = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "audit_log") {
        return {
          insert: () => Promise.resolve({ error: null }),
        };
      }
      call += 1;
      if (call === 1) {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { role: "super_admin", is_platform_admin: false },
                }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: { role: "super_admin", organisation_id: null, full_name: "Ops Admin" },
              }),
          }),
        }),
      };
    });
    mockSignIn.mockResolvedValue({
      data: { user: { id: "super-1", email: "ops@acme.com" } },
      error: null,
    });
    const { POST } = await import("@/app/api/auth/login/route");
    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ops@acme.com", password: "password123" }),
    });
    const response = await POST(request as any);
    expect(response.status).toBe(200);
  });

  it("returns 401 when signIn fails", async () => {
    const recordCallsBefore = mockRecordLoginFailure.mock.calls.length;
    const clearCallsBefore = mockClearLoginFailures.mock.calls.length;
    mockSignIn.mockResolvedValue({
      data: null,
      error: { message: "Invalid credentials" },
    });
    const { POST } = await import("@/app/api/auth/login/route");
    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "u@example.com", password: "password123" }),
    });
    const response = await POST(request as any);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain("Invalid");
    expect(mockRecordLoginFailure).toHaveBeenCalledWith("u@example.com");
    expect(mockRecordLoginFailure.mock.calls.length).toBe(recordCallsBefore + 1);
    expect(mockClearLoginFailures.mock.calls.length).toBe(clearCallsBefore);
  });

  it("returns 429 when account is lock-blocked", async () => {
    const recordCallsBefore = mockRecordLoginFailure.mock.calls.length;
    mockGetLoginLockStatus.mockResolvedValue({
      locked: true,
      lockedUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    const { POST } = await import("@/app/api/auth/login/route");
    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "u@example.com", password: "password123" }),
    });
    const response = await POST(request as any);
    expect(response.status).toBe(429);
    expect(mockRecordLoginFailure.mock.calls.length).toBe(recordCallsBefore);
  });

  it("returns 429 when failure recording locks the account", async () => {
    mockSignIn.mockResolvedValue({
      data: null,
      error: { message: "Invalid credentials" },
    });
    mockRecordLoginFailure.mockResolvedValue({
      locked: true,
      remainingAttempts: 0,
      lockedUntil: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });
    const { POST } = await import("@/app/api/auth/login/route");
    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "u@example.com", password: "password123" }),
    });
    const response = await POST(request as any);
    expect(response.status).toBe(429);
  });

  it("returns 200 and user + redirectTo when signIn succeeds", async () => {
    const adminBuilder = {
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: {
                role: "candidate_free",
                organisation_id: "org-1",
                full_name: "Test User",
              },
            }),
        }),
      }),
    };
    mockAdminFrom.mockReturnValue(adminBuilder);
    mockSignIn.mockResolvedValue({
      data: {
        user: { id: "user-1", email: "u@example.com" },
      },
      error: null,
    });
    const { POST } = await import("@/app/api/auth/login/route");
    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "u@example.com", password: "password123" }),
    });
    const response = await POST(request as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe("u@example.com");
    expect(body.redirectTo).toBeDefined();
    expect(mockClearLoginFailures).toHaveBeenCalledWith("u@example.com");
  });

  it("uses returnTo when signIn succeeds and path is same-origin safe", async () => {
    const adminBuilder = {
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: {
                role: "candidate_free",
                organisation_id: "org-1",
                full_name: "Test User",
              },
            }),
        }),
      }),
    };
    mockAdminFrom.mockReturnValue(adminBuilder);
    mockSignIn.mockResolvedValue({
      data: {
        user: { id: "user-1", email: "u@example.com" },
      },
      error: null,
    });
    const { POST } = await import("@/app/api/auth/login/route");
    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "u@example.com",
        password: "password123",
        returnTo: "/dashboard/referrer/join",
      }),
    });
    const response = await POST(request as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.redirectTo).toBe("/dashboard/referrer/join");
  });

  it("returns generic invalid credentials when organisation enforces SSO for company role", async () => {
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    role: "leadership",
                    organisation_id: "org-1",
                    full_name: "Company Admin",
                  },
                }),
            }),
          }),
        };
      }
      if (table === "organisations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { enforce_sso: true },
                  error: null,
                }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null }),
          }),
        }),
      };
    });
    mockSignIn.mockResolvedValue({
      data: {
        user: { id: "user-company-admin", email: "admin@company.com" },
      },
      error: null,
    });

    const { POST } = await import("@/app/api/auth/login/route");
    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@company.com", password: "password123" }),
    });
    const response = await POST(request as any);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain("Invalid email or password");
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
  it("includes verification guidance without revealing account existence", async () => {
    mockSignIn.mockResolvedValue({
      data: { user: null },
      error: { message: "Email not confirmed", code: "email_not_confirmed" },
    });
    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "new@example.com", password: "test-password" }),
      }) as any,
    );
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain("Invalid email or password");
    expect(body.error).toContain("If you just signed up, verify your email");
  });
});
