import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockCheckRateLimit = vi.fn();
let mockEnv: { baseUrl?: string } = {};
const originalNodeEnv = process.env.NODE_ENV;

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIpForRateLimit: () => "127.0.0.1",
  RATE_LIMIT_PRESETS: {
    default: { limit: 30, windowSecs: 60 },
  },
}));

vi.mock("@/lib/config/env", () => ({
  get env() {
    return mockEnv;
  },
}));

describe("GET /api/auth/callback/[...rest]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockEnv = {};
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("redirects to login with rate-limited error when rate limit fails", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });
    const { GET } = await import("@/app/api/auth/callback/[...rest]/route");
    const req = new NextRequest("http://localhost:3000/api/auth/callback/google?code=abc");
    const res = await GET(req);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("rate_limited");
  });

  it("redirects catch-all callback to /api/auth/callback and preserves query params", async () => {
    const { GET } = await import("@/app/api/auth/callback/[...rest]/route");
    const req = new NextRequest(
      "http://localhost:3000/api/auth/callback/google?code=abc&next=%2Frecruit",
    );
    const res = await GET(req);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe("http://localhost:3000");
    expect(location.pathname).toBe("/api/auth/callback");
    expect(location.searchParams.get("code")).toBe("abc");
    expect(location.searchParams.get("next")).toBe("/recruit");
  });

  it("uses env.baseUrl for callback redirect in production", async () => {
    process.env.NODE_ENV = "production";
    mockEnv = { baseUrl: "https://app.tigerhire.io" };
    const { GET } = await import("@/app/api/auth/callback/[...rest]/route");
    const req = new NextRequest("http://localhost:3000/api/auth/callback/google?code=abc");
    const res = await GET(req);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe("https://app.tigerhire.io");
    expect(location.pathname).toBe("/api/auth/callback");
    expect(location.searchParams.get("code")).toBe("abc");
  });
});
