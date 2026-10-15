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

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: () => Promise.resolve({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIpForRateLimit: () => "127.0.0.1",
  RATE_LIMIT_PRESETS: {
    auth: { limit: 10, windowSecs: 60 },
    default: { limit: 30, windowSecs: 60 },
  },
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/config/env", () => ({
  env: { baseUrl: "https://tigerhire.io" },
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/api-helpers";

const mockCreateSupabase = createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>;
const mockGetAuth = getAuthContext as unknown as ReturnType<typeof vi.fn>;

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
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });

  it("returns 422 for invalid provider", async () => {
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
    const json = await res.json();
    expect(json.error).toContain("Invalid provider");
  });

  it("returns 422 when provider is missing from body", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const supabase = createMockSupabase();
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/auth/link/route");
    const req = buildRequest("http://localhost/api/auth/link", {
      method: "POST",
      body: {},
    });
    const res = await POST(req as never);
    expect(res.status).toBe(422);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);

    const { POST } = await import("@/app/api/auth/link/route");
    const req = new Request("http://localhost/api/auth/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json{{{",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Invalid JSON");
  });

  it("returns 200 with URL on successful google link", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const supabase = createMockSupabase();
    (supabase.auth as Record<string, unknown>).linkIdentity = vi.fn().mockResolvedValue({
      data: { url: "https://accounts.google.com/link?token=abc" },
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
    expect(json.url).toContain("google.com");
    expect(json.provider).toBe("google");
  });

  it("returns 200 with URL on successful linkedin_oidc link", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const supabase = createMockSupabase();
    (supabase.auth as Record<string, unknown>).linkIdentity = vi.fn().mockResolvedValue({
      data: { url: "https://www.linkedin.com/oauth/v2/authorization?xyz" },
      error: null,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/auth/link/route");
    const req = buildRequest("http://localhost/api/auth/link", {
      method: "POST",
      body: { provider: "linkedin_oidc" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toContain("linkedin.com");
    expect(json.provider).toBe("linkedin_oidc");
  });

  it("returns 200 with URL on successful azure link", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const supabase = createMockSupabase();
    (supabase.auth as Record<string, unknown>).linkIdentity = vi.fn().mockResolvedValue({
      data: { url: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?xyz" },
      error: null,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/auth/link/route");
    const req = buildRequest("http://localhost/api/auth/link", {
      method: "POST",
      body: { provider: "azure" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toContain("microsoftonline.com");
    expect(json.provider).toBe("azure");
  });

  it("returns 500 when linkIdentity fails", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const supabase = createMockSupabase();
    (supabase.auth as Record<string, unknown>).linkIdentity = vi.fn().mockResolvedValue({
      data: { url: null },
      error: { message: "Provider error" },
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/auth/link/route");
    const req = buildRequest("http://localhost/api/auth/link", {
      method: "POST",
      body: { provider: "google" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("Failed to link");
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

  it("returns linked identities for authenticated user", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const supabase = createMockSupabase();
    (supabase.auth as Record<string, unknown>).getUserIdentities = vi.fn().mockResolvedValue({
      data: {
        identities: [
          {
            provider: "google",
            identity_id: "gid-1",
            created_at: "2026-01-01",
            last_sign_in_at: "2026-03-01",
          },
          {
            provider: "linkedin_oidc",
            identity_id: "lid-2",
            created_at: "2026-02-01",
            last_sign_in_at: "2026-03-10",
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
    expect(json.identities).toHaveLength(2);
    expect(json.identities[0].provider).toBe("google");
    expect(json.identities[1].provider).toBe("linkedin_oidc");
  });

  it("returns empty identities when no providers linked", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const supabase = createMockSupabase();
    (supabase.auth as Record<string, unknown>).getUserIdentities = vi.fn().mockResolvedValue({
      data: { identities: [] },
      error: null,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/auth/link/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.identities).toHaveLength(0);
  });

  it("returns 500 when getUserIdentities fails", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const supabase = createMockSupabase();
    (supabase.auth as Record<string, unknown>).getUserIdentities = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Auth service unavailable" },
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/auth/link/route");
    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("Failed to get linked accounts");
  });
});
