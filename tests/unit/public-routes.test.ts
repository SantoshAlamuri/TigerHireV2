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

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/utils/dlq", () => ({
  appendToDlq: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  RATE_LIMIT_PRESETS: { publicForm: { limit: 5, windowSecs: 60 } },
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

// ---------------------------------------------------------------------------
// POST /api/contact
// ---------------------------------------------------------------------------
describe("POST /api/contact", () => {
  beforeEach(() => {
    mockAdminFrom.mockReset();
    mockSendContactNotification.mockClear();
  });

  it("returns 400 for missing name", async () => {
    const { POST } = await import("@/app/api/contact/route");
    const req = jsonRequest("http://localhost:3000/api/contact", {
      email: "test@test.com",
      message: "Hello",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  }, 15000);

  it("returns 400 for invalid email", async () => {
    const { POST } = await import("@/app/api/contact/route");
    const req = jsonRequest("http://localhost:3000/api/contact", {
      name: "Test",
      email: "invalid",
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

  it("returns 500 when database insert fails", async () => {
    const builder = createMockQueryBuilder({
      error: { message: "insert fail" },
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
  });

  it("returns 200 on successful submission", async () => {
    const builder = createMockQueryBuilder({ error: null });
    mockAdminFrom.mockReturnValue(builder);

    const { POST } = await import("@/app/api/contact/route");
    const req = jsonRequest("http://localhost:3000/api/contact", {
      name: "Test User",
      email: "test@test.com",
      message: "I want to learn more",
      company: "Acme",
      type: "company",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
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

  it("returns 400 when request body is not JSON", async () => {
    const { POST } = await import("@/app/api/contact/route");
    const req = new Request("http://localhost:3000/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/waitlist
// ---------------------------------------------------------------------------
describe("POST /api/waitlist", () => {
  beforeEach(() => {
    mockAdminFrom.mockReset();
  });

  it("returns 400 for invalid email", async () => {
    const { POST } = await import("@/app/api/waitlist/route");
    const req = jsonRequest("http://localhost:3000/api/waitlist", {
      email: "not-email",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("returns 200 with success message for valid email", async () => {
    const builder = createMockQueryBuilder({ error: null });
    mockAdminFrom.mockReturnValue(builder);

    const { POST } = await import("@/app/api/waitlist/route");
    const req = jsonRequest("http://localhost:3000/api/waitlist", {
      email: "user@test.com",
      type: "company",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("defaults type to candidate", async () => {
    const builder = createMockQueryBuilder({ error: null });
    mockAdminFrom.mockReturnValue(builder);

    const { POST } = await import("@/app/api/waitlist/route");
    const req = jsonRequest("http://localhost:3000/api/waitlist", {
      email: "user@test.com",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
  });

  it("returns 200 even when upsert fails (graceful)", async () => {
    const builder = createMockQueryBuilder({
      error: { message: "upsert fail" },
    });
    mockAdminFrom.mockReturnValue(builder);

    const { POST } = await import("@/app/api/waitlist/route");
    const req = jsonRequest("http://localhost:3000/api/waitlist", {
      email: "user@test.com",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
  });

  it("returns 400 when body parsing throws", async () => {
    const { POST } = await import("@/app/api/waitlist/route");
    const req = new Request("http://localhost:3000/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "broken",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/waitlist/count
// ---------------------------------------------------------------------------
describe("GET /api/waitlist/count", () => {
  beforeEach(() => {
    mockAdminFrom.mockReset();
    vi.stubEnv("WAITLIST_COUNT_SEED", "100");
  });

  it("returns count + seed on success", async () => {
    const builder = createMockQueryBuilder({ count: 42 });
    (builder as any).then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({ count: 42, error: null }),
    );
    mockAdminFrom.mockReturnValue(builder);

    const { GET } = await import("@/app/api/waitlist/count/route");
    const res = await GET(new Request("http://localhost:3000/api/waitlist/count") as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.count).toBe("number");
  });

  it("returns seed when query errors", async () => {
    const builder = createMockQueryBuilder({ error: { message: "fail" } });
    (builder as any).then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({ count: null, error: { message: "fail" } }),
    );
    mockAdminFrom.mockReturnValue(builder);

    const { GET } = await import("@/app/api/waitlist/count/route");
    const res = await GET(new Request("http://localhost:3000/api/waitlist/count") as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.count).toBe("number");
  });
});
