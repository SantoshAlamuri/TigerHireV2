import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-helpers", () => ({
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
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
  }),
}));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      auth: { getUser: () => mockGetUser() },
    }),
}));

vi.mock("@/lib/redis/auth-profile-cache", () => ({
  deleteCachedAuthProfile: vi.fn().mockResolvedValue(undefined),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  RATE_LIMIT_PRESETS: {
    default: { limit: 30, windowSecs: 60 },
  },
}));

function chainInvites(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    update: vi.fn().mockReturnThis(),
  };
}

describe("GET /api/invites/[token]", () => {
  beforeEach(() => {
    mockAdminFrom.mockReset();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
  });

  it("returns 404 when invite not found", async () => {
    mockAdminFrom.mockReturnValue(chainInvites(null, new Error("not found")));
    const { GET } = await import("@/app/api/invites/[token]/route");
    const req = new NextRequest("http://localhost:3000/api/invites/bad-token");
    const res = await GET(req, { params: Promise.resolve({ token: "bad-token" }) });
    expect(res.status).toBe(404);
  });

  it("returns 429 when invite lookups are rate limited", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: new Date() });
    const { GET } = await import("@/app/api/invites/[token]/route");
    const req = new NextRequest("http://localhost:3000/api/invites/limited-token");
    const res = await GET(req, { params: Promise.resolve({ token: "limited-token" }) });
    expect(res.status).toBe(429);
  });

  it("returns 410 when invite already accepted", async () => {
    mockAdminFrom.mockReturnValue(
      chainInvites({
        id: "inv-1",
        email: "u@test.com",
        role: "recruiter",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        accepted_at: new Date().toISOString(),
        organisations: { name: "Acme" },
      }),
    );
    const { GET } = await import("@/app/api/invites/[token]/route");
    const req = new NextRequest("http://localhost:3000/api/invites/valid-token");
    const res = await GET(req, { params: Promise.resolve({ token: "valid-token" }) });
    expect(res.status).toBe(410);
  });

  it("returns 410 when invite expired", async () => {
    mockAdminFrom.mockReturnValue(
      chainInvites({
        id: "inv-1",
        email: "u@test.com",
        role: "recruiter",
        expires_at: new Date(Date.now() - 86400000).toISOString(),
        accepted_at: null,
        organisations: { name: "Acme" },
      }),
    );
    const { GET } = await import("@/app/api/invites/[token]/route");
    const req = new NextRequest("http://localhost:3000/api/invites/expired-token");
    const res = await GET(req, { params: Promise.resolve({ token: "expired-token" }) });
    expect(res.status).toBe(410);
  });

  it("returns 200 with invite details when valid", async () => {
    mockAdminFrom.mockReturnValue(
      chainInvites({
        id: "inv-1",
        email: "u@test.com",
        role: "recruiter",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        accepted_at: null,
        organisations: { name: "Acme" },
      }),
    );
    const { GET } = await import("@/app/api/invites/[token]/route");
    const req = new NextRequest("http://localhost:3000/api/invites/valid-token");
    const res = await GET(req, { params: Promise.resolve({ token: "valid-token" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe("u@test.com");
    expect(body.role).toBe("recruiter");
    expect(body.organisation).toBeDefined();
  });
});

describe("POST /api/invites/[token]", () => {
  beforeEach(() => {
    mockAdminFrom.mockReset();
    mockGetUser.mockReset();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
  });

  it("returns 401 when user not logged in", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    mockAdminFrom.mockReturnValue(
      chainInvites({
        id: "inv-1",
        email: "u@test.com",
        token: "valid-token",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        accepted_at: null,
      }),
    );
    const { POST } = await import("@/app/api/invites/[token]/route");
    const req = new NextRequest("http://localhost:3000/api/invites/valid-token", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ token: "valid-token" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when logged-in user email does not match invite", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { email: "other@test.com" } },
      error: null,
    });
    mockAdminFrom.mockReturnValue(
      chainInvites({
        id: "inv-1",
        email: "invited@test.com",
        token: "valid-token",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        accepted_at: null,
      }),
    );
    const { POST } = await import("@/app/api/invites/[token]/route");
    const req = new NextRequest("http://localhost:3000/api/invites/valid-token", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ token: "valid-token" }) });
    expect(res.status).toBe(403);
  });

  it("returns 410 when invite already used on POST", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { email: "u@test.com" } },
      error: null,
    });
    mockAdminFrom.mockReturnValue(
      chainInvites({
        id: "inv-1",
        email: "u@test.com",
        token: "valid-token",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        accepted_at: new Date().toISOString(),
      }),
    );
    const { POST } = await import("@/app/api/invites/[token]/route");
    const req = new NextRequest("http://localhost:3000/api/invites/valid-token", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ token: "valid-token" }) });
    expect(res.status).toBe(410);
  });
});
