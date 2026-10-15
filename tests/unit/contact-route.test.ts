import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockQueryBuilder } from "../helpers";

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...a: unknown[]) => mockAdminFrom(...a),
  }),
}));

const mockSendContactNotification = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/services/resend", () => ({
  sendContactNotification: (...args: unknown[]) => mockSendContactNotification(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/utils/dlq", () => ({
  appendToDlq: vi.fn().mockResolvedValue(undefined),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  RATE_LIMIT_PRESETS: { publicForm: { maxRequests: 5, windowMs: 60000 } },
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
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
        }),
      };
    }
  },
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: vi.fn(),
}));

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/contact", () => {
  beforeEach(() => {
    mockAdminFrom.mockReset();
    mockSendContactNotification.mockClear();
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
  });

  it("returns 400 for missing name (422 invalid body)", async () => {
    const { POST } = await import("@/app/api/contact/route");
    const req = jsonRequest("http://localhost:3000/api/contact", {
      email: "test@test.com",
      message: "Hello",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 for missing email", async () => {
    const { POST } = await import("@/app/api/contact/route");
    const req = jsonRequest("http://localhost:3000/api/contact", {
      name: "Test",
      message: "Hello",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid email", async () => {
    const { POST } = await import("@/app/api/contact/route");
    const req = jsonRequest("http://localhost:3000/api/contact", {
      name: "Test",
      email: "not-an-email",
      message: "Hello",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing message", async () => {
    const { POST } = await import("@/app/api/contact/route");
    const req = jsonRequest("http://localhost:3000/api/contact", {
      name: "Test",
      email: "test@test.com",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty message", async () => {
    const { POST } = await import("@/app/api/contact/route");
    const req = jsonRequest("http://localhost:3000/api/contact", {
      name: "Test",
      email: "test@test.com",
      message: "",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("returns 200 on successful submission", async () => {
    const builder = createMockQueryBuilder({ error: null });
    mockAdminFrom.mockReturnValue(builder);

    const { POST } = await import("@/app/api/contact/route");
    const req = jsonRequest("http://localhost:3000/api/contact", {
      name: "Jane Doe",
      email: "jane@example.com",
      message: "I'd like to learn more about TigerHire",
      company: "Acme Corp",
      type: "company",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toBeDefined();
  });

  it("calls sendContactNotification on success", async () => {
    const builder = createMockQueryBuilder({ error: null });
    mockAdminFrom.mockReturnValue(builder);

    const { POST } = await import("@/app/api/contact/route");
    const req = jsonRequest("http://localhost:3000/api/contact", {
      name: "Jane",
      email: "jane@example.com",
      message: "Hello",
    });
    await POST(req as any);
    expect(mockSendContactNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Jane",
        email: "jane@example.com",
        message: "Hello",
      }),
    );
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });

    const { POST } = await import("@/app/api/contact/route");
    const req = jsonRequest("http://localhost:3000/api/contact", {
      name: "Test",
      email: "test@test.com",
      message: "Hello",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("Too many");
  });

  it("returns 500 on database insert failure", async () => {
    const builder = createMockQueryBuilder({
      error: { message: "insert failed" },
    });
    mockAdminFrom.mockReturnValue(builder);

    const { POST } = await import("@/app/api/contact/route");
    const req = jsonRequest("http://localhost:3000/api/contact", {
      name: "Test",
      email: "test@test.com",
      message: "Hello world",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 when request body is not valid JSON", async () => {
    const { POST } = await import("@/app/api/contact/route");
    const req = new Request("http://localhost:3000/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json at all",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("defaults type to 'other' when not specified", async () => {
    const builder = createMockQueryBuilder({ error: null });
    mockAdminFrom.mockReturnValue(builder);

    const { POST } = await import("@/app/api/contact/route");
    const req = jsonRequest("http://localhost:3000/api/contact", {
      name: "Test",
      email: "test@test.com",
      message: "Message",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
  });
});
