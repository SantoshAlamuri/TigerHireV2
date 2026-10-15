import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
let supabaseStub: unknown;

vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-helpers")>();
  return { ...actual, getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args) };
});
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => supabaseStub,
}));
vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

type LogRow = { delivery_status: string | null; created_at: string };

function makeSupabase(rows: LogRow[], dlqCount: number) {
  const log: Record<string, unknown> = {};
  log.select = () => log;
  log.eq = () => log;
  log.gte = () => log;
  log.order = () => log;
  log.limit = () => Promise.resolve({ data: rows, error: null });

  const dlq: Record<string, unknown> = {};
  dlq.select = () => dlq;
  dlq.eq = () => dlq;
  dlq.gte = () => Promise.resolve({ count: dlqCount, error: null });

  const stalledSessions: Record<string, unknown> = {};
  stalledSessions.select = () => stalledSessions;
  stalledSessions.eq = () => stalledSessions;
  stalledSessions.contains = () => stalledSessions;
  stalledSessions.lte = () => Promise.resolve({ count: 0, error: null });

  const pendingJd: Record<string, unknown> = {};
  pendingJd.select = () => pendingJd;
  pendingJd.lte = () => Promise.resolve({ count: 0, error: null });

  return {
    from: (t: string) => {
      if (t === "whatsapp_message_log") return log;
      if (t === "failed_operations") return dlq;
      if (t === "whatsapp_sessions") return stalledSessions;
      if (t === "pending_jd_approval") return pendingJd;
      throw new Error(`unexpected table: ${t}`);
    },
  };
}

function makeSupabaseWithPromises(
  rows: LogRow[],
  dlqCount: number,
  scoring: number,
  pending: number,
) {
  const supabase = makeSupabase(rows, dlqCount) as {
    from: (table: string) => Record<string, unknown>;
  };
  const from = supabase.from;
  return {
    from: (table: string) => {
      if (table === "whatsapp_sessions") {
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.contains = () => builder;
        builder.lte = () => Promise.resolve({ count: scoring, error: null });
        return builder;
      }
      if (table === "pending_jd_approval") {
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.lte = () => Promise.resolve({ count: pending, error: null });
        return builder;
      }
      return from(table);
    },
  };
}

function req() {
  return new NextRequest("http://localhost:3000/api/admin/whatsapp-health");
}

beforeEach(() => {
  mockGetAuthContext.mockReset();
  supabaseStub = makeSupabase([], 0);
});

describe("GET /api/admin/whatsapp-health", () => {
  it("401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/admin/whatsapp-health/route");
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("403 when not super_admin", async () => {
    mockGetAuthContext.mockResolvedValue({ role: "recruiter" });
    const { GET } = await import("@/app/api/admin/whatsapp-health/route");
    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it("aggregates delivery status into 1h / 24h buckets and reports DLQ count", async () => {
    mockGetAuthContext.mockResolvedValue({ role: "super_admin" });
    const nowMs = Date.now();
    const recent = new Date(nowMs - 5 * 60 * 1000).toISOString(); // in 1h + 24h
    const old = new Date(nowMs - 3 * 60 * 60 * 1000).toISOString(); // 24h only
    supabaseStub = makeSupabase(
      [
        { delivery_status: "failed", created_at: recent },
        { delivery_status: "delivered", created_at: recent },
        { delivery_status: null, created_at: old },
        { delivery_status: "failed", created_at: old },
      ],
      7,
    );

    const { GET } = await import("@/app/api/admin/whatsapp-health/route");
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      windows: {
        "1h": { total: number; failed: number; delivered: number };
        "24h": { total: number; failed: number; pending: number; failure_rate: number };
      };
      dlq: { whatsapp_send_24h: number };
      circuit_breaker: { whatsapp: string };
      promises: { stalled_scoring_callbacks_10m: number; pending_jd_approval_over_24h: number };
    };

    expect(body.windows["24h"]).toMatchObject({
      total: 4,
      failed: 2,
      pending: 1,
      failure_rate: 0.5,
    });
    expect(body.windows["1h"]).toMatchObject({ total: 2, failed: 1, delivered: 1 });
    expect(body.dlq.whatsapp_send_24h).toBe(7);
    expect(body.promises).toEqual({
      stalled_scoring_callbacks_10m: 0,
      pending_jd_approval_over_24h: 0,
    });
    expect(typeof body.circuit_breaker.whatsapp).toBe("string");
  });

  it("reports stale WhatsApp promises separately from delivery health", async () => {
    mockGetAuthContext.mockResolvedValue({ role: "super_admin" });
    supabaseStub = makeSupabaseWithPromises([], 1, 3, 5);

    const { GET } = await import("@/app/api/admin/whatsapp-health/route");
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      promises: { stalled_scoring_callbacks_10m: number; pending_jd_approval_over_24h: number };
      dlq: { whatsapp_send_24h: number };
    };

    expect(body.promises).toEqual({
      stalled_scoring_callbacks_10m: 3,
      pending_jd_approval_over_24h: 5,
    });
    expect(body.dlq.whatsapp_send_24h).toBe(1);
  });
});
