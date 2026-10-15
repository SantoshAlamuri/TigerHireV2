import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, recruiterCtx, buildRequest } from "../helpers";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: vi.fn(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  parseJsonBody: async (request: Request) => {
    try {
      const body = await request.json();
      return { body, errorResponse: null };
    } catch {
      return {
        body: null,
        errorResponse: Response.json({ error: "Invalid JSON body" }, { status: 400 }),
      };
    }
  },
  jsonError: (msg: string, status: number) => Response.json({ error: msg }, { status }),
  jsonSuccess: (data: unknown, status = 200) => Response.json(data, { status }),
  handleApiError: (_err: unknown, msg: string) => Response.json({ error: msg }, { status: 500 }),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: () => Promise.resolve({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIpForRateLimit: () => "127.0.0.1",
  RATE_LIMIT_PRESETS: {
    auth: { limit: 10, windowSecs: 60 },
    default: { limit: 30, windowSecs: 60 },
  },
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/config/env", () => ({
  env: { baseUrl: "https://tigerhire.io" },
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/api-helpers";

const mockCreateSupabase = createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>;
const mockGetAuth = getAuthContext as unknown as ReturnType<typeof vi.fn>;

describe("POST /api/auth/sso", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid provider", async () => {
    const supabase = createMockSupabase();
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/auth/sso/route");
    const req = buildRequest("http://localhost/api/auth/sso", {
      method: "POST",
      body: { provider: "facebook" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(422);
  });

  it("rejects missing provider", async () => {
    const supabase = createMockSupabase();
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/auth/sso/route");
    const req = buildRequest("http://localhost/api/auth/sso", {
      method: "POST",
      body: {},
    });
    const res = await POST(req as never);
    expect(res.status).toBe(422);
  });

  it("returns OAuth URL for google provider", async () => {
    const supabase = createMockSupabase();
    (supabase.auth as Record<string, unknown>).signInWithOAuth = vi.fn().mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/auth?..." },
      error: null,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/auth/sso/route");
    const req = buildRequest("http://localhost/api/auth/sso", {
      method: "POST",
      body: { provider: "google" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toContain("google.com");
    expect(json.provider).toBe("google");
  });

  it("returns OAuth URL for linkedin_oidc provider", async () => {
    const supabase = createMockSupabase();
    (supabase.auth as Record<string, unknown>).signInWithOAuth = vi.fn().mockResolvedValue({
      data: { url: "https://www.linkedin.com/oauth/v2/authorization?..." },
      error: null,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/auth/sso/route");
    const req = buildRequest("http://localhost/api/auth/sso", {
      method: "POST",
      body: { provider: "linkedin_oidc" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toContain("linkedin.com");
    expect(json.provider).toBe("linkedin_oidc");
  });

  it("returns OAuth URL for azure provider (Microsoft Entra ID)", async () => {
    const supabase = createMockSupabase();
    (supabase.auth as Record<string, unknown>).signInWithOAuth = vi.fn().mockResolvedValue({
      data: { url: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?..." },
      error: null,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/auth/sso/route");
    const req = buildRequest("http://localhost/api/auth/sso", {
      method: "POST",
      body: { provider: "azure" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toContain("microsoftonline.com");
    expect(json.provider).toBe("azure");
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "azure",
        options: expect.objectContaining({ scopes: "email" }),
      }),
    );
  });

  it("handles OAuth initiation failure", async () => {
    const supabase = createMockSupabase();
    (supabase.auth as Record<string, unknown>).signInWithOAuth = vi.fn().mockResolvedValue({
      data: { url: null },
      error: { message: "Provider not configured" },
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/auth/sso/route");
    const req = buildRequest("http://localhost/api/auth/sso", {
      method: "POST",
      body: { provider: "google" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(500);
  });

  it("passes safe next path and public flow to callback redirect", async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/auth?..." },
      error: null,
    });
    const supabase = createMockSupabase();
    (supabase.auth as Record<string, unknown>).signInWithOAuth = signInWithOAuth;
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/auth/sso/route");
    const req = buildRequest("http://localhost/api/auth/sso", {
      method: "POST",
      body: {
        provider: "google",
        redirect_to: "/refer/join?parent=abc",
        flow: "public",
      },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(signInWithOAuth).toHaveBeenCalledTimes(1);
    const call = signInWithOAuth.mock.calls[0]?.[0] as {
      options?: { redirectTo?: string };
    };
    expect(call.options?.redirectTo).toContain("/api/auth/callback?");
    expect(call.options?.redirectTo).toContain("next=%2Frefer%2Fjoin%3Fparent%3Dabc");
    expect(call.options?.redirectTo).toContain("flow=public");
  });
});

describe("POST /api/auth/link", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);

    const { POST } = await import("@/app/api/auth/link/route");
    const req = buildRequest("http://localhost/api/auth/link", {
      method: "POST",
      body: { provider: "google" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it("rejects invalid provider", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const supabase = createMockSupabase();
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/auth/link/route");
    const req = buildRequest("http://localhost/api/auth/link", {
      method: "POST",
      body: { provider: "twitter" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(422);
  });

  it("returns linking URL for authenticated user", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const supabase = createMockSupabase();
    (supabase.auth as Record<string, unknown>).linkIdentity = vi.fn().mockResolvedValue({
      data: { url: "https://accounts.google.com/link?..." },
      error: null,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/auth/link/route");
    const req = buildRequest("http://localhost/api/auth/link", {
      method: "POST",
      body: { provider: "google" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toBeTruthy();
  });
});

describe("GET /api/auth/link", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);

    const { GET } = await import("@/app/api/auth/link/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns linked identities", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const supabase = createMockSupabase();
    (supabase.auth as Record<string, unknown>).getUserIdentities = vi.fn().mockResolvedValue({
      data: {
        identities: [
          {
            provider: "google",
            identity_id: "google-123",
            created_at: "2026-01-01",
            last_sign_in_at: "2026-02-01",
          },
        ],
      },
      error: null,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/auth/link/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.identities).toHaveLength(1);
    expect(json.identities[0].provider).toBe("google");
  });
});
