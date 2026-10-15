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

const mockProcessUnprocessedSignals = vi.fn();
vi.mock("@/lib/agents/talent-scout", () => ({
  processUnprocessedSignals: (...args: unknown[]) => mockProcessUnprocessedSignals(...args),
}));

function cronRequest(url: string, secret?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (secret) headers["authorization"] = `Bearer ${secret}`;
  return new Request(url, { method: "POST", headers });
}

// ---------------------------------------------------------------------------
// POST /api/cron/process-signals
// ---------------------------------------------------------------------------
describe("POST /api/cron/process-signals", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    mockFrom.mockReset();
    mockRpc.mockReset();
    mockProcessUnprocessedSignals.mockReset();
    // Rate limit RPC returns count within limit by default
    mockRpc.mockResolvedValue({ data: 1, error: null });
  });

  it("returns 401 without valid CRON_SECRET", async () => {
    const { POST } = await import("@/app/api/cron/process-signals/route");
    const res = await POST(
      cronRequest("http://localhost:3000/api/cron/process-signals", "wrong") as any,
    );
    expect(res.status).toBe(401);
  }, 15000);

  it("returns 401 when no authorization header", async () => {
    const { POST } = await import("@/app/api/cron/process-signals/route");
    const res = await POST(cronRequest("http://localhost:3000/api/cron/process-signals") as any);
    expect(res.status).toBe(401);
  });

  it("returns 200 and processes signals successfully", async () => {
    mockProcessUnprocessedSignals.mockResolvedValue({
      runId: "run-123",
      recordsProcessed: 5,
      recordsCreated: 3,
      recordsUpdated: 2,
      errors: [],
    });

    const { POST } = await import("@/app/api/cron/process-signals/route");
    const res = await POST(
      cronRequest("http://localhost:3000/api/cron/process-signals", CRON_SECRET) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runId).toBe("run-123");
    expect(body.processed).toBe(5);
    expect(body.created).toBe(3);
    expect(body.updated).toBe(2);
    expect(body.errors).toBe(0);
    expect(mockProcessUnprocessedSignals).toHaveBeenCalledWith(100);
  });

  it("returns 200 with { processed: 0 } when no unprocessed signals", async () => {
    mockProcessUnprocessedSignals.mockResolvedValue({
      runId: "run-456",
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      errors: [],
    });

    const { POST } = await import("@/app/api/cron/process-signals/route");
    const res = await POST(
      cronRequest("http://localhost:3000/api/cron/process-signals", CRON_SECRET) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(0);
    expect(body.created).toBe(0);
    expect(body.updated).toBe(0);
    expect(body.errors).toBe(0);
  });

  it("returns 500 on processing error", async () => {
    mockProcessUnprocessedSignals.mockRejectedValue(new Error("Agent processing failed"));

    const { POST } = await import("@/app/api/cron/process-signals/route");
    const res = await POST(
      cronRequest("http://localhost:3000/api/cron/process-signals", CRON_SECRET) as any,
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Signal processing failed");
  });
});
