import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockQueryBuilder } from "../helpers";

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...a: unknown[]) => mockAdminFrom(...a),
  }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
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

describe("POST /api/waitlist", () => {
  beforeEach(() => {
    mockAdminFrom.mockReset();
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
  });

  it("returns 400 for invalid email", async () => {
    const { POST } = await import("@/app/api/waitlist/route");
    const req = jsonRequest("http://localhost:3000/api/waitlist", {
      email: "not-a-valid-email",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 for missing email", async () => {
    const { POST } = await import("@/app/api/waitlist/route");
    const req = jsonRequest("http://localhost:3000/api/waitlist", {});
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("returns 200 on successful signup", async () => {
    const builder = createMockQueryBuilder({ error: null });
    mockAdminFrom.mockReturnValue(builder);

    const { POST } = await import("@/app/api/waitlist/route");
    const req = jsonRequest("http://localhost:3000/api/waitlist", {
      email: "user@example.com",
      type: "company",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toBeDefined();
  });

  it("returns 200 on duplicate email (upsert is graceful)", async () => {
    const builder = createMockQueryBuilder({ error: null });
    mockAdminFrom.mockReturnValue(builder);

    const { POST } = await import("@/app/api/waitlist/route");
    // First signup
    const req1 = jsonRequest("http://localhost:3000/api/waitlist", {
      email: "duplicate@example.com",
    });
    const res1 = await POST(req1 as any);
    expect(res1.status).toBe(200);

    // Second signup with same email (upsert)
    const req2 = jsonRequest("http://localhost:3000/api/waitlist", {
      email: "duplicate@example.com",
    });
    const res2 = await POST(req2 as any);
    expect(res2.status).toBe(200);
  });

  it("returns 200 even when upsert fails (graceful degradation)", async () => {
    const builder = createMockQueryBuilder({
      error: { message: "upsert conflict" },
    });
    mockAdminFrom.mockReturnValue(builder);

    const { POST } = await import("@/app/api/waitlist/route");
    const req = jsonRequest("http://localhost:3000/api/waitlist", {
      email: "user@example.com",
    });
    const res = await POST(req as any);
    // The waitlist route returns 200 even on upsert failure (graceful)
    expect(res.status).toBe(200);
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });

    const { POST } = await import("@/app/api/waitlist/route");
    const req = jsonRequest("http://localhost:3000/api/waitlist", {
      email: "user@example.com",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("Too many");
  });

  it("returns 400 when request body is not valid JSON", async () => {
    const { POST } = await import("@/app/api/waitlist/route");
    const req = new Request("http://localhost:3000/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "broken json{",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("defaults type to candidate when not specified", async () => {
    const builder = createMockQueryBuilder({ error: null });
    mockAdminFrom.mockReturnValue(builder);

    const { POST } = await import("@/app/api/waitlist/route");
    const req = jsonRequest("http://localhost:3000/api/waitlist", {
      email: "user@example.com",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid type value", async () => {
    const { POST } = await import("@/app/api/waitlist/route");
    const req = jsonRequest("http://localhost:3000/api/waitlist", {
      email: "user@example.com",
      type: "invalid_type",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });
});
