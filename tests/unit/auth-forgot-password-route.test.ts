import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-helpers", () => ({
  parseJsonBody: async (request: Request) => {
    try {
      const body = await request.json();
      return { body, errorResponse: null };
    } catch {
      return {
        body: null,
        errorResponse: new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      };
    }
  },
  jsonError: (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  jsonSuccess: (data: unknown) =>
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  handleZodError: (err: { issues: Array<{ message: string }> }) =>
    new Response(
      JSON.stringify({
        error: err.issues.map((e: { message: string }) => e.message).join("; "),
      }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    ),
  reportError: vi.fn(),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
  shouldEnforceAuthCsrfToken: () => false,
  startAuthCsrfIssuerProbe: () => undefined,
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  RATE_LIMIT_PRESETS: { auth: { max: 5, windowSeconds: 60 } },
}));
const mockReservePasswordResetCooldown = vi.fn();
vi.mock("@/lib/security/auth-throttle", () => ({
  reservePasswordResetCooldown: (...args: unknown[]) => mockReservePasswordResetCooldown(...args),
}));

const mockResetPasswordForEmail = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      resetPasswordForEmail: (...args: unknown[]) => mockResetPasswordForEmail(...args),
    },
  }),
}));

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCheckRateLimit.mockReset();
    mockResetPasswordForEmail.mockReset();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockResetPasswordForEmail.mockResolvedValue({ error: null });
    mockReservePasswordResetCooldown.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const req = new NextRequest("http://localhost:3000/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const req = new NextRequest("http://localhost:3000/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 422 when email is missing or invalid", async () => {
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const req = new NextRequest("http://localhost:3000/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("returns 200 when email is valid and rate limit allows", async () => {
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const req = new NextRequest("http://localhost:3000/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBeDefined();
    expect(mockReservePasswordResetCooldown).toHaveBeenCalledWith("user@example.com");
  });

  it("returns 429 when password reset cooldown is active", async () => {
    mockReservePasswordResetCooldown.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 180,
    });
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const req = new NextRequest("http://localhost:3000/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });
});
