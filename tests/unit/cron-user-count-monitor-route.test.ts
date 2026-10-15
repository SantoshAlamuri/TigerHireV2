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

function cronRequest(url: string, secret?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (secret) headers["authorization"] = `Bearer ${secret}`;
  return new Request(url, { method: "POST", headers });
}

// ---------------------------------------------------------------------------
// POST /api/cron/user-count-monitor
// ---------------------------------------------------------------------------
describe("POST /api/cron/user-count-monitor", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    mockFrom.mockReset();
    mockRpc.mockReset();
    // Rate limit RPC returns count within limit by default
    mockRpc.mockResolvedValue({ data: 1, error: null });
  });

  it("returns 401 without valid CRON_SECRET", async () => {
    const { POST } = await import("@/app/api/cron/user-count-monitor/route");
    const res = await POST(
      cronRequest("http://localhost:3000/api/cron/user-count-monitor", "wrong") as any,
    );
    expect(res.status).toBe(401);
  }, 15000);

  it("returns 401 when no authorization header", async () => {
    const { POST } = await import("@/app/api/cron/user-count-monitor/route");
    const res = await POST(cronRequest("http://localhost:3000/api/cron/user-count-monitor") as any);
    expect(res.status).toBe(401);
  });

  it("records snapshot and returns healthy when count is stable", async () => {
    // profiles select (count: 100)
    const profilesBuilder = createMockQueryBuilder({ count: 100 });
    // user_count_snapshots select (last snapshot)
    const snapshotSelectBuilder = createMockQueryBuilder({
      data: { user_count: 98, checked_at: new Date().toISOString() },
    });
    // user_count_snapshots insert
    const insertBuilder = createMockQueryBuilder();
    // user_count_snapshots delete (cleanup old)
    const deleteBuilder = createMockQueryBuilder();

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === "profiles") return profilesBuilder;
      if (table === "user_count_snapshots") {
        // First call: select last snapshot, second: insert, third: delete
        if (callCount === 2) return snapshotSelectBuilder;
        if (callCount === 3) return insertBuilder;
        return deleteBuilder;
      }
      return createMockQueryBuilder();
    });

    const { POST } = await import("@/app/api/cron/user-count-monitor/route");
    const res = await POST(
      cronRequest("http://localhost:3000/api/cron/user-count-monitor", CRON_SECRET) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alert).toBe(false);
    expect(body.currentCount).toBe(100);
    expect(body.previousCount).toBe(98);
  });

  it("returns alert when user count drops significantly (>10%)", async () => {
    // profiles select (count dropped from 100 to 80 = 20% drop)
    const profilesBuilder = createMockQueryBuilder({ count: 80 });
    // user_count_snapshots select (last snapshot was 100)
    const snapshotSelectBuilder = createMockQueryBuilder({
      data: { user_count: 100, checked_at: new Date().toISOString() },
    });
    // insert and delete builders
    const genericBuilder = createMockQueryBuilder();

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === "profiles") return profilesBuilder;
      if (table === "user_count_snapshots") {
        if (callCount === 2) return snapshotSelectBuilder;
        return genericBuilder;
      }
      return genericBuilder;
    });

    const { POST } = await import("@/app/api/cron/user-count-monitor/route");
    const res = await POST(
      cronRequest("http://localhost:3000/api/cron/user-count-monitor", CRON_SECRET) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alert).toBe(true);
    expect(body.currentCount).toBe(80);
    expect(body.previousCount).toBe(100);
    expect(body.dropPercentage).toBe(20);
    expect(body.message).toContain("USER COUNT ALERT");
  });

  it("returns no alert when there is no previous snapshot", async () => {
    // profiles select (count: 50)
    const profilesBuilder = createMockQueryBuilder({ count: 50 });
    // user_count_snapshots select (no previous data)
    const snapshotSelectBuilder = createMockQueryBuilder({ data: null });
    const genericBuilder = createMockQueryBuilder();

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === "profiles") return profilesBuilder;
      if (table === "user_count_snapshots") {
        if (callCount === 2) return snapshotSelectBuilder;
        return genericBuilder;
      }
      return genericBuilder;
    });

    const { POST } = await import("@/app/api/cron/user-count-monitor/route");
    const res = await POST(
      cronRequest("http://localhost:3000/api/cron/user-count-monitor", CRON_SECRET) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alert).toBe(false);
    expect(body.currentCount).toBe(50);
    expect(body.previousCount).toBe(0);
  });

  it("returns no alert for small drop within threshold", async () => {
    // 5% drop (100 -> 95), under the 10% threshold
    const profilesBuilder = createMockQueryBuilder({ count: 95 });
    const snapshotSelectBuilder = createMockQueryBuilder({
      data: { user_count: 100, checked_at: new Date().toISOString() },
    });
    const genericBuilder = createMockQueryBuilder();

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === "profiles") return profilesBuilder;
      if (table === "user_count_snapshots") {
        if (callCount === 2) return snapshotSelectBuilder;
        return genericBuilder;
      }
      return genericBuilder;
    });

    const { POST } = await import("@/app/api/cron/user-count-monitor/route");
    const res = await POST(
      cronRequest("http://localhost:3000/api/cron/user-count-monitor", CRON_SECRET) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alert).toBe(false);
    expect(body.currentCount).toBe(95);
    expect(body.previousCount).toBe(100);
  });
});
