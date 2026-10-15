import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockCheckRateLimit = vi.fn();
const mockValidateOrigin = vi.fn();
const mockReportError = vi.fn();

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIpForRateLimit: () => "127.0.0.1",
  RATE_LIMIT_PRESETS: {
    default: { limit: 30, windowSecs: 60 },
  },
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: (...args: unknown[]) => mockValidateOrigin(...args),
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

describe("POST /api/auth/log-auth-error", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockValidateOrigin.mockReturnValue(null);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });
    const { POST } = await import("@/app/api/auth/log-auth-error/route");
    const req = new NextRequest("http://localhost:3000/api/auth/log-auth-error", {
      method: "POST",
      body: JSON.stringify({ message: "Invalid login credentials" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(mockReportError).not.toHaveBeenCalled();
  });

  it("returns csrf response when origin validation fails", async () => {
    mockValidateOrigin.mockReturnValue(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    );
    const { POST } = await import("@/app/api/auth/log-auth-error/route");
    const req = new NextRequest("http://localhost:3000/api/auth/log-auth-error", {
      method: "POST",
      body: JSON.stringify({ message: "Invalid login credentials" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(mockReportError).not.toHaveBeenCalled();
  });

  it("logs auth error and returns 204 on valid payload", async () => {
    const { POST } = await import("@/app/api/auth/log-auth-error/route");
    const req = new NextRequest("http://localhost:3000/api/auth/log-auth-error", {
      method: "POST",
      body: JSON.stringify({
        code: "invalid_credentials",
        message: "Invalid login credentials",
        emailDomain: "example.com",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(204);
    expect(mockReportError).toHaveBeenCalledTimes(1);
    expect(mockReportError).toHaveBeenCalledWith(expect.any(Error), {
      route: "/api/auth/log-auth-error",
      authErrorCode: "invalid_credentials",
      emailDomain: "example.com",
    });
  });

  it("still returns 204 and reports when request parsing throws", async () => {
    const parsingError = new Error("body read failed");
    const { POST } = await import("@/app/api/auth/log-auth-error/route");
    const req = {
      text: vi.fn().mockRejectedValue(parsingError),
    } as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(204);
    expect(mockReportError).toHaveBeenCalledWith(parsingError, {
      route: "/api/auth/log-auth-error",
    });
  });
});
