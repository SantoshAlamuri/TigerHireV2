import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
  shouldEnforceAuthCsrfToken: () => false,
  startAuthCsrfIssuerProbe: () => undefined,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: () => Promise.resolve({ allowed: true, remaining: 10, resetAt: new Date() }),
  RATE_LIMIT_PRESETS: { auth: { limit: 10, windowSecs: 60 } },
}));

const mockSignUp = vi.fn();
const mockRpc = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { signUp: (...args: unknown[]) => mockSignUp(...args) },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    rpc: mockRpc,
  }),
}));

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSignUp.mockReset();
    mockRpc.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  });

  it("returns 422 for invalid body (missing userType)", async () => {
    const { POST } = await import("@/app/api/auth/register/route");
    const request = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "a@b.com",
        password: "password123",
        fullName: "Test User",
      }),
    });
    const response = await POST(request as any);
    expect(response.status).toBe(422);
  }, 15000);

  it("returns 422 for short fullName", async () => {
    const { POST } = await import("@/app/api/auth/register/route");
    const request = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "a@b.com",
        password: "password123",
        fullName: "A",
        userType: "candidate",
      }),
    });
    const response = await POST(request as any);
    expect(response.status).toBe(422);
  });

  it("returns 400 when signUp returns error", async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null },
      error: { message: "Email already registered" },
    });
    const { POST } = await import("@/app/api/auth/register/route");
    const request = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "u@example.com",
        password: "password123",
        fullName: "Test User",
        userType: "candidate",
      }),
    });
    const response = await POST(request as any);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 201 and user when signUp and rpc succeed", async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { id: "user-1", email: "u@example.com" } },
      error: null,
    });
    mockRpc.mockResolvedValue({ data: "org-1", error: null });
    const { POST } = await import("@/app/api/auth/register/route");
    const request = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "u@example.com",
        password: "password123",
        fullName: "Test User",
        userType: "candidate",
      }),
    });
    const response = await POST(request as any);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe("u@example.com");
    expect(body.message).toBeTruthy();
  });
  it.each([false, true])(
    "creates a company owner with confirmation state %s",
    async (confirmed) => {
      mockSignUp.mockResolvedValue({
        data: {
          user: { id: "owner-1", email: "owner@example.com", identities: [{ id: "identity-1" }] },
          session: confirmed ? { access_token: "test-token" } : null,
        },
        error: null,
      });
      mockRpc.mockResolvedValue({ data: "company-1", error: null });
      const { POST } = await import("@/app/api/auth/register/route");
      const response = await POST(
        new Request("http://localhost:3000/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "Owner@Example.com",
            password: "test-password123",
            fullName: "Test Owner",
            userType: "company",
            organisationName: "Test Company",
          }),
        }) as any,
      );
      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.confirmed).toBe(confirmed);
      expect(body.user).toMatchObject({ role: "leadership", organisationId: "company-1" });
      expect(mockRpc).toHaveBeenCalledWith("register_create_org_and_profile", {
        p_user_id: "owner-1",
        p_role: "leadership",
        p_full_name: "Test Owner",
        p_org_name: "Test Company",
        p_org_type: "company",
      });
      expect(mockSignUp.mock.calls[0][0].email).toBe("owner@example.com");
    },
  );
});
