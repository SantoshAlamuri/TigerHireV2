import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const originalEnv = process.env.NODE_ENV;

describe("GET /api/auth/oauth-redirect-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("returns 404 in production", async () => {
    process.env.NODE_ENV = "production";
    const { GET } = await import("@/app/api/auth/oauth-redirect-url/route");
    const req = new NextRequest("http://localhost:3000/api/auth/oauth-redirect-url");
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it("returns redirect URLs in development", async () => {
    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

    const { GET } = await import("@/app/api/auth/oauth-redirect-url/route");
    const req = new NextRequest("http://localhost:3000/api/auth/oauth-redirect-url");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.appRedirectUrl).toBe("http://localhost:3000/api/auth/callback");
    expect(body.supabaseCallbackUrl).toBe("https://test.supabase.co/auth/v1/callback");
    expect(body.hint).toBeDefined();
  });

  it("handles missing NEXT_PUBLIC_SUPABASE_URL", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    const { GET } = await import("@/app/api/auth/oauth-redirect-url/route");
    const req = new NextRequest("http://localhost:3000/api/auth/oauth-redirect-url");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.appRedirectUrl).toBe("http://localhost:3000/api/auth/callback");
    expect(body.supabaseCallbackUrl).toBe("");
  });
});
