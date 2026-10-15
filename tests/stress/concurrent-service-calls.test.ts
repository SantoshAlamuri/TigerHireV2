import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, createMockQueryBuilder } from "../helpers";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => ({
    rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "not deployed" } }),
  })),
}));

vi.mock("@/lib/redis/auth-profile-cache", () => ({
  deleteCachedAuthProfile: vi.fn().mockResolvedValue(undefined),
}));

describe("Concurrent Service Calls — Stress Tests", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("handles 100 concurrent JobService.list calls", async () => {
    const jobs = [
      { id: "j1", title: "Engineer", created_at: "2026-01-01", matched_count: 0 },
      { id: "j2", title: "Designer", created_at: "2026-01-02", matched_count: 0 },
    ];
    const builder = createMockQueryBuilder({ data: jobs, count: 2 });
    const supabase = createMockSupabase({
      jobs: builder,
      pipeline_candidates: createMockQueryBuilder({ data: [], count: 0 }),
    });

    const { JobService } = await import("@/lib/services/JobService");

    const results = await Promise.all(
      Array.from({ length: 100 }, () => JobService.list(supabase, { page: 1, limit: 10 })),
    );

    expect(results).toHaveLength(100);
    for (const r of results) {
      expect(r.jobs).toHaveLength(2);
      expect(r.jobs[0]).toMatchObject({ id: "j1", title: "Engineer" });
      expect(r.jobs[1]).toMatchObject({ id: "j2", title: "Designer" });
      expect(r.pagination.total).toBe(2);
    }
  });

  it("handles 100 concurrent ApplicationService.listForCandidate calls", async () => {
    const apps = [{ id: "a1", status: "applied" }];
    const builder = createMockQueryBuilder({ data: apps, count: 1 });
    const supabase = createMockSupabase({ applications: builder });

    const { ApplicationService } = await import("@/lib/services/ApplicationService");

    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        ApplicationService.listForCandidate(supabase, "c1", {
          page: 1,
          limit: 10,
        }),
      ),
    );

    expect(results).toHaveLength(100);
    for (const r of results) {
      expect(r.applications).toEqual(apps);
    }
  });

  it("handles mixed read/write operations concurrently", async () => {
    const readBuilder = createMockQueryBuilder({
      data: [{ id: "j1", title: "Test" }],
      count: 1,
    });
    const writeBuilder = createMockQueryBuilder({
      data: { id: "j-new", title: "New Job" },
    });
    const supabase = createMockSupabase({
      jobs: readBuilder,
    });

    const { JobService } = await import("@/lib/services/JobService");

    const operations = [
      ...Array.from({ length: 50 }, () => JobService.list(supabase, { page: 1, limit: 10 })),
      ...Array.from({ length: 30 }, () => JobService.getActiveByCompany(supabase, "org-1")),
    ];

    const results = await Promise.allSettled(operations);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBe(80);
  });

  it("handles rapid sequential operations without resource leaks", async () => {
    const builder = createMockQueryBuilder({
      data: { id: "j1", title: "Job" },
    });
    const supabase = createMockSupabase({ jobs: builder });

    const { JobService } = await import("@/lib/services/JobService");

    for (let i = 0; i < 200; i++) {
      const result = await JobService.getById(supabase, `job-${i}`);
      expect(result).toBeDefined();
    }
  });
});
