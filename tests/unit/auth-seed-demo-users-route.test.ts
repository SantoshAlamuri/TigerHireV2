import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockCreateSupabaseAdmin = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

describe("POST /api/auth/seed-demo-users", () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalSeedPassword = process.env.SEED_DEMO_PASSWORD;
  const originalSeedSecret = process.env.SEED_DEMO_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.resetModules();
    mockCreateSupabaseAdmin.mockReset();
    process.env.NODE_ENV = "development";
    process.env.SEED_DEMO_PASSWORD = "demo-password";
    process.env.SEED_DEMO_SECRET = "demo-secret";
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.SEED_DEMO_PASSWORD = originalSeedPassword;
    process.env.SEED_DEMO_SECRET = originalSeedSecret;
    if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalVercelEnv;
  });

  it("returns 404 when VERCEL_ENV is production even if SEED_DEMO_PASSWORD is set", async () => {
    process.env.VERCEL_ENV = "production";
    const { POST } = await import("@/app/api/auth/seed-demo-users/route");
    const req = new NextRequest("http://localhost:3000/api/auth/seed-demo-users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not available");
  });

  it("returns 404 in non-dev without x-seed-demo-secret even when password is set", async () => {
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "preview";
    const { POST } = await import("@/app/api/auth/seed-demo-users/route");
    const req = new NextRequest("http://localhost:3000/api/auth/seed-demo-users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(mockCreateSupabaseAdmin).not.toHaveBeenCalled();
  });
});
