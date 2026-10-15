import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockSignInWithPassword = vi.fn();
const mockAdminUpsert = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      auth: {
        signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: {
                  role: "candidate_free",
                  organisation_id: null,
                  full_name: "Test Candidate",
                },
              }),
          }),
        }),
      }),
    }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: () => ({
      upsert: (...args: unknown[]) => mockAdminUpsert(...args),
    }),
  }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

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
  jsonSuccess: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
}));

describe("POST /api/auth/test-login", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSeedPassword = process.env.SEED_DEMO_PASSWORD;
  const originalVercelEnv = process.env.VERCEL_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminUpsert.mockResolvedValue({ data: null, error: null });
    process.env.NODE_ENV = "development";
    process.env.SEED_DEMO_PASSWORD = "demo-password";
    delete process.env.VERCEL_ENV;
  });

  it("returns 400 for malformed JSON", async () => {
    const { POST } = await import("@/app/api/auth/test-login/route");
    const req = new NextRequest("http://localhost:3000/api/auth/test-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-whitelisted test account", async () => {
    const { POST } = await import("@/app/api/auth/test-login/route");
    const req = new NextRequest("http://localhost:3000/api/auth/test-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "unknown@example.com" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 when VERCEL_ENV is production even if SEED_DEMO_PASSWORD is set", async () => {
    process.env.VERCEL_ENV = "production";
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: "u-1", email: "sam@tigerhire.io" } },
      error: null,
    });
    const { POST } = await import("@/app/api/auth/test-login/route");
    const req = new NextRequest("http://localhost:3000/api/auth/test-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "sam@tigerhire.io" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("returns 200 for valid whitelisted account", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: "u-1", email: "sam@tigerhire.io" } },
      error: null,
    });
    const { POST } = await import("@/app/api/auth/test-login/route");
    const req = new NextRequest("http://localhost:3000/api/auth/test-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "sam@tigerhire.io" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe("sam@tigerhire.io");
    expect(body.redirectTo).toBeDefined();
    expect(body.user.isPlatformAdmin).toBe(true);
    expect(mockAdminUpsert).toHaveBeenCalledTimes(1);
  });

  it("grants platform admin in test mode for admin@tigerhire.com", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: "u-admin-1", email: "admin@tigerhire.com" } },
      error: null,
    });
    const { POST } = await import("@/app/api/auth/test-login/route");
    const req = new NextRequest("http://localhost:3000/api/auth/test-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@tigerhire.com" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe("admin@tigerhire.com");
    expect(body.user.isPlatformAdmin).toBe(true);
    expect(mockAdminUpsert).toHaveBeenCalledTimes(1);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.SEED_DEMO_PASSWORD = originalSeedPassword;
    if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalVercelEnv;
  });
});

describe("POST /api/auth/test-login — preview gating (Finding B)", () => {
  const saved = {
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    seedPassword: process.env.SEED_DEMO_PASSWORD,
    enabled: process.env.TEST_LOGIN_ENABLED,
    secret: process.env.TEST_LOGIN_SECRET,
    allowedIps: process.env.TEST_LOGIN_ALLOWED_IPS,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminUpsert.mockResolvedValue({ data: null, error: null });
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: "u-1", email: "sam@tigerhire.io" } },
      error: null,
    });
    // Simulate a Vercel preview deploy.
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "preview";
    process.env.SEED_DEMO_PASSWORD = "demo-password";
    delete process.env.TEST_LOGIN_ENABLED;
    delete process.env.TEST_LOGIN_SECRET;
    delete process.env.TEST_LOGIN_ALLOWED_IPS;
  });

  afterEach(() => {
    process.env.NODE_ENV = saved.nodeEnv;
    if (saved.vercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = saved.vercelEnv;
    if (saved.seedPassword === undefined) delete process.env.SEED_DEMO_PASSWORD;
    else process.env.SEED_DEMO_PASSWORD = saved.seedPassword;
    if (saved.enabled === undefined) delete process.env.TEST_LOGIN_ENABLED;
    else process.env.TEST_LOGIN_ENABLED = saved.enabled;
    if (saved.secret === undefined) delete process.env.TEST_LOGIN_SECRET;
    else process.env.TEST_LOGIN_SECRET = saved.secret;
    if (saved.allowedIps === undefined) delete process.env.TEST_LOGIN_ALLOWED_IPS;
    else process.env.TEST_LOGIN_ALLOWED_IPS = saved.allowedIps;
  });

  function previewReq(headers: Record<string, string> = {}) {
    return new NextRequest("http://localhost:3000/api/auth/test-login", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ email: "sam@tigerhire.io" }),
    });
  }

  it("returns 404 on preview when TEST_LOGIN_ENABLED is not set", async () => {
    const { POST } = await import("@/app/api/auth/test-login/route");
    const res = await POST(previewReq());
    expect(res.status).toBe(404);
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("returns 404 when enabled on preview but no secondary control is configured", async () => {
    process.env.TEST_LOGIN_ENABLED = "true";
    const { POST } = await import("@/app/api/auth/test-login/route");
    const res = await POST(previewReq());
    expect(res.status).toBe(404);
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("returns 401 when secret is configured but the request omits it", async () => {
    process.env.TEST_LOGIN_ENABLED = "true";
    process.env.TEST_LOGIN_SECRET = "super-secret";
    const { POST } = await import("@/app/api/auth/test-login/route");
    const res = await POST(previewReq());
    expect(res.status).toBe(401);
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("returns 401 when the provided secret is wrong", async () => {
    process.env.TEST_LOGIN_ENABLED = "true";
    process.env.TEST_LOGIN_SECRET = "super-secret";
    const { POST } = await import("@/app/api/auth/test-login/route");
    const res = await POST(previewReq({ "x-test-login-secret": "wrong" }));
    expect(res.status).toBe(401);
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("succeeds on preview with flag + matching secret header", async () => {
    process.env.TEST_LOGIN_ENABLED = "true";
    process.env.TEST_LOGIN_SECRET = "super-secret";
    const { POST } = await import("@/app/api/auth/test-login/route");
    const res = await POST(previewReq({ "x-test-login-secret": "super-secret" }));
    expect(res.status).toBe(200);
    expect(mockSignInWithPassword).toHaveBeenCalledTimes(1);
  });

  it("succeeds on preview with flag + allowlisted client IP", async () => {
    process.env.TEST_LOGIN_ENABLED = "true";
    process.env.TEST_LOGIN_ALLOWED_IPS = "10.0.0.5, 203.0.113.7";
    const { POST } = await import("@/app/api/auth/test-login/route");
    const res = await POST(previewReq({ "x-forwarded-for": "203.0.113.7" }));
    expect(res.status).toBe(200);
    expect(mockSignInWithPassword).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-allowlisted client IP with 401", async () => {
    process.env.TEST_LOGIN_ENABLED = "true";
    process.env.TEST_LOGIN_ALLOWED_IPS = "10.0.0.5";
    const { POST } = await import("@/app/api/auth/test-login/route");
    const res = await POST(previewReq({ "x-forwarded-for": "198.51.100.9" }));
    expect(res.status).toBe(401);
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });
});
