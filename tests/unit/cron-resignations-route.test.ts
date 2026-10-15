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

function cronRequest(url: string, secret?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (secret) headers["authorization"] = `Bearer ${secret}`;
  // Note: resignations route uses GET
  return new Request(url, { method: "GET", headers });
}

// ---------------------------------------------------------------------------
// GET /api/cron/resignations
// ---------------------------------------------------------------------------
describe("GET /api/cron/resignations", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    mockFrom.mockReset();
    mockRpc.mockReset();
    // Rate limit RPC returns count within limit by default
    mockRpc.mockResolvedValue({ data: 1, error: null });
  });

  it("returns 401 without valid CRON_SECRET", async () => {
    const { GET } = await import("@/app/api/cron/resignations/route");
    const res = await GET(
      cronRequest("http://localhost:3000/api/cron/resignations", "wrong") as any,
    );
    expect(res.status).toBe(401);
  }, 15000);

  it("returns 401 when no authorization header", async () => {
    const { GET } = await import("@/app/api/cron/resignations/route");
    const res = await GET(cronRequest("http://localhost:3000/api/cron/resignations") as any);
    expect(res.status).toBe(401);
  });

  it("returns { processed: 0 } when no pending resignations", async () => {
    const builder = createMockQueryBuilder({ data: [] });
    mockFrom.mockReturnValue(builder);

    const { GET } = await import("@/app/api/cron/resignations/route");
    const res = await GET(
      cronRequest("http://localhost:3000/api/cron/resignations", CRON_SECRET) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(0);
  });

  it("returns { processed: 0 } when data is null", async () => {
    const builder = createMockQueryBuilder({ data: null });
    mockFrom.mockReturnValue(builder);

    const { GET } = await import("@/app/api/cron/resignations/route");
    const res = await GET(
      cronRequest("http://localhost:3000/api/cron/resignations", CRON_SECRET) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(0);
  });

  it("processes resignations: marks as alumni and unlocks profiles", async () => {
    const pending = [
      { id: "re-1", candidate_id: "c-1" },
      { id: "re-2", candidate_id: "c-2" },
    ];

    const selectBuilder = createMockQueryBuilder({ data: pending });
    const updateBuilder = createMockQueryBuilder();

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      // First call is the select on resignation_events
      if (callCount === 1) return selectBuilder;
      // Subsequent calls are updates on candidates and resignation_events
      return updateBuilder;
    });

    const { GET } = await import("@/app/api/cron/resignations/route");
    const res = await GET(
      cronRequest("http://localhost:3000/api/cron/resignations", CRON_SECRET) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(2);
  });

  it("returns 500 on DB error", async () => {
    mockFrom.mockImplementation(() => {
      throw new Error("Database connection failed");
    });

    const { GET } = await import("@/app/api/cron/resignations/route");
    const res = await GET(
      cronRequest("http://localhost:3000/api/cron/resignations", CRON_SECRET) as any,
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed");
  });
});
