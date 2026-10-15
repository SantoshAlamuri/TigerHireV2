import { beforeEach, describe, expect, it, vi } from "vitest";
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
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

const mockSendReferrerOtp = vi.fn();
vi.mock("@/lib/services/referrer-otp", () => ({
  sendReferrerOtp: (...args: unknown[]) => mockSendReferrerOtp(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: vi.fn() }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

vi.mock("@/lib/config/env", () => ({
  env: {
    isProduction: true,
    referOtpSendPhoneLimit: 2,
    referOtpSendPhoneWindowSecs: 60,
    referOtpSendIpLimit: 5,
    referOtpSendIpWindowSecs: 60,
  },
}));

describe("POST /api/refer/otp/send", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCheckRateLimit.mockReset();
    mockSendReferrerOtp.mockReset();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockSendReferrerOtp.mockResolvedValue({ delivered: true, code: "123456" });
  });

  it("returns 400 for malformed WhatsApp numbers before rate limiting", async () => {
    const { POST } = await import("@/app/api/refer/otp/send/route");
    const req = new NextRequest("http://localhost:3000/api/refer/otp/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "1.1.1.1",
      },
      body: JSON.stringify({ phone: "123" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Please enter a valid WhatsApp number.",
    });
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockSendReferrerOtp).not.toHaveBeenCalled();
  });

  it("returns 429 when phone-primary limit is exceeded", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false });
    const { POST } = await import("@/app/api/refer/otp/send/route");
    const req = new NextRequest("http://localhost:3000/api/refer/otp/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "1.1.1.1",
      },
      body: JSON.stringify({ phone: "+91 90000 00000" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "refer-otp-send:phone:919000000000",
        limit: 2,
      }),
    );
    expect(mockSendReferrerOtp).not.toHaveBeenCalled();
  });

  it("returns 429 when IP-secondary limit is exceeded", async () => {
    mockCheckRateLimit
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false });
    const { POST } = await import("@/app/api/refer/otp/send/route");
    const req = new NextRequest("http://localhost:3000/api/refer/otp/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "2.2.2.2",
      },
      body: JSON.stringify({ whatsapp_number: "919111122223" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        key: "refer-otp-send:ip:2.2.2.2",
        limit: 5,
      }),
    );
    expect(mockSendReferrerOtp).not.toHaveBeenCalled();
  });

  it("sends OTP when both phone and IP are under threshold", async () => {
    mockCheckRateLimit
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: true });
    const { POST } = await import("@/app/api/refer/otp/send/route");
    const req = new NextRequest("http://localhost:3000/api/refer/otp/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "3.3.3.3",
      },
      body: JSON.stringify({ phone: "+91 98888 77777" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockSendReferrerOtp).toHaveBeenCalledTimes(1);
    expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        key: "refer-otp-send:phone:919888877777",
      }),
    );
    expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        key: "refer-otp-send:ip:3.3.3.3",
      }),
    );
  });
});
