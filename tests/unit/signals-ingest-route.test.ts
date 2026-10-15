import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockQueryBuilder } from "../helpers";

const CRON_SECRET = "test-cron-secret";

const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockSupabaseAdmin = {
  from: (...args: unknown[]) => mockFrom(...args),
  rpc: (...args: unknown[]) => mockRpc(...args),
  auth: {
    admin: { getUserById: vi.fn() },
  },
};

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockSupabaseAdmin,
}));

vi.mock("@/lib/config/env", () => ({
  env: {
    baseUrl: "http://localhost:3000",
    cronSecret: "test-cron-secret",
  },
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: vi.fn(),
}));

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  jsonError: (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  jsonSuccess: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
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
}));

// Mock rate limiting to always allow
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 29,
    resetAt: new Date(Date.now() + 60_000),
  }),
}));

function ingestRequest(body: unknown, options: { secret?: string; noAuth?: boolean } = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.secret) headers["authorization"] = `Bearer ${options.secret}`;
  return new Request("http://localhost:3000/api/signals/ingest", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function validSignal(overrides: Record<string, unknown> = {}) {
  return {
    source: "naukri",
    external_id: "ext-001",
    raw_data: { name: "John Doe", experience: "5 years" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// POST /api/signals/ingest
// ---------------------------------------------------------------------------
describe("POST /api/signals/ingest", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    mockFrom.mockReset();
    mockRpc.mockReset();
    mockGetAuthContext.mockReset();
    // Rate limit RPC returns count within limit by default
    mockRpc.mockResolvedValue({ data: 1, error: null });
  });

  it("returns 401 without auth (no cron secret and no user session)", async () => {
    // No cron secret in headers, and no authenticated user
    mockGetAuthContext.mockResolvedValue(null);

    const { POST } = await import("@/app/api/signals/ingest/route");
    const res = await POST(ingestRequest({ signals: [validSignal()] }) as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated but not super_admin", async () => {
    // No cron secret, but has a recruiter session
    mockGetAuthContext.mockResolvedValue({
      userId: "u-1",
      role: "recruiter",
      organisationId: "org-1",
    });

    const { POST } = await import("@/app/api/signals/ingest/route");
    const res = await POST(ingestRequest({ signals: [validSignal()] }) as any);
    expect(res.status).toBe(403);
  });

  it("returns 422 for invalid signal data (missing required fields)", async () => {
    const { POST } = await import("@/app/api/signals/ingest/route");
    const res = await POST(
      ingestRequest(
        {
          signals: [{ source: "naukri" }], // missing external_id and raw_data
        },
        { secret: CRON_SECRET },
      ) as any,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 for invalid source enum", async () => {
    const { POST } = await import("@/app/api/signals/ingest/route");
    const res = await POST(
      ingestRequest(
        {
          signals: [
            {
              source: "invalid_source",
              external_id: "ext-1",
              raw_data: { name: "Test" },
            },
          ],
        },
        { secret: CRON_SECRET },
      ) as any,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 for empty signals array", async () => {
    const { POST } = await import("@/app/api/signals/ingest/route");
    const res = await POST(ingestRequest({ signals: [] }, { secret: CRON_SECRET }) as any);
    expect(res.status).toBe(422);
  });

  it("returns 200 on successful ingestion with cron secret", async () => {
    const upsertBuilder = createMockQueryBuilder({
      data: [{ id: "sig-1" }, { id: "sig-2" }],
    });
    mockFrom.mockReturnValue(upsertBuilder);

    const { POST } = await import("@/app/api/signals/ingest/route");
    const res = await POST(
      ingestRequest(
        {
          signals: [
            validSignal({ external_id: "ext-1" }),
            validSignal({ external_id: "ext-2", source: "linkedin" }),
          ],
        },
        { secret: CRON_SECRET },
      ) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(2);
    expect(body.inserted).toBe(2);
    expect(body.skipped).toBe(0);
    expect(body.errors).toEqual([]);
  });

  it("returns 200 on successful ingestion with super_admin auth", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "u-super",
      role: "super_admin",
      organisationId: null,
    });

    const upsertBuilder = createMockQueryBuilder({
      data: [{ id: "sig-1" }],
    });
    mockFrom.mockReturnValue(upsertBuilder);

    const { POST } = await import("@/app/api/signals/ingest/route");
    const res = await POST(ingestRequest({ signals: [validSignal()] }) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(1);
    expect(body.inserted).toBe(1);
  });

  it("deduplicates by (source, external_id) via upsert", async () => {
    // When duplicates are skipped, insertedRows returns fewer rows
    const upsertBuilder = createMockQueryBuilder({
      data: [{ id: "sig-1" }], // only 1 inserted out of 3
    });
    mockFrom.mockReturnValue(upsertBuilder);

    const { POST } = await import("@/app/api/signals/ingest/route");
    const res = await POST(
      ingestRequest(
        {
          signals: [
            validSignal({ external_id: "ext-1" }),
            validSignal({ external_id: "ext-1" }), // duplicate
            validSignal({ external_id: "ext-1" }), // duplicate
          ],
        },
        { secret: CRON_SECRET },
      ) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(3);
    expect(body.inserted).toBe(1);
    expect(body.skipped).toBe(2);
  });

  it("handles bulk ingestion of multiple signals", async () => {
    const signals = Array.from({ length: 50 }, (_, i) =>
      validSignal({
        external_id: `ext-${i}`,
        source: i % 2 === 0 ? "naukri" : "indeed",
        raw_data: { name: `Candidate ${i}` },
      }),
    );
    const insertedIds = signals.map((_, i) => ({ id: `sig-${i}` }));
    const upsertBuilder = createMockQueryBuilder({ data: insertedIds });
    mockFrom.mockReturnValue(upsertBuilder);

    const { POST } = await import("@/app/api/signals/ingest/route");
    const res = await POST(ingestRequest({ signals }, { secret: CRON_SECRET }) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(50);
    expect(body.inserted).toBe(50);
    expect(body.skipped).toBe(0);
  });

  it("returns 500 when upsert fails", async () => {
    const upsertBuilder = createMockQueryBuilder({
      data: null,
      error: { message: "unique constraint violation" },
    });
    mockFrom.mockReturnValue(upsertBuilder);

    const { POST } = await import("@/app/api/signals/ingest/route");
    const res = await POST(
      ingestRequest({ signals: [validSignal()] }, { secret: CRON_SECRET }) as any,
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Failed to ingest signals");
  });

  it("includes optional signal_strength when provided", async () => {
    const upsertBuilder = createMockQueryBuilder({
      data: [{ id: "sig-1" }],
    });
    mockFrom.mockReturnValue(upsertBuilder);

    const { POST } = await import("@/app/api/signals/ingest/route");
    const res = await POST(
      ingestRequest(
        {
          signals: [validSignal({ signal_strength: 85 })],
        },
        { secret: CRON_SECRET },
      ) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inserted).toBe(1);
  });

  it("returns 422 when signal_strength is out of range", async () => {
    const { POST } = await import("@/app/api/signals/ingest/route");
    const res = await POST(
      ingestRequest(
        {
          signals: [validSignal({ signal_strength: 150 })],
        },
        { secret: CRON_SECRET },
      ) as any,
    );
    expect(res.status).toBe(422);
  });
});
