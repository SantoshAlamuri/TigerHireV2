import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, createMockQueryBuilder } from "../helpers";
import { serviceBenchmarkLimits } from "../helpers/ci-perf";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => ({
    rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "not deployed" } }),
  })),
}));

vi.mock("@/lib/fitscore/hybrid/jd-base", () => ({
  ensureJdBaseForJob: vi.fn().mockResolvedValue(undefined),
  getJdBaseByJobId: vi.fn().mockResolvedValue({ id: "jdb-bench-1", jobId: "j-new" }),
}));

vi.mock("@/lib/redis/auth-profile-cache", () => ({
  deleteCachedAuthProfile: vi.fn().mockResolvedValue(undefined),
}));

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  opsPerSec: number;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function benchmark(
  name: string,
  fn: () => Promise<void>,
  iterations = 100,
): Promise<BenchmarkResult> {
  const durations: number[] = [];

  // warmup
  for (let i = 0; i < 5; i++) await fn();

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    durations.push(performance.now() - start);
  }

  durations.sort((a, b) => a - b);
  const totalMs = durations.reduce((s, d) => s + d, 0);

  return {
    name,
    iterations,
    totalMs: Math.round(totalMs * 100) / 100,
    avgMs: Math.round((totalMs / iterations) * 100) / 100,
    p50Ms: Math.round(percentile(durations, 50) * 100) / 100,
    p95Ms: Math.round(percentile(durations, 95) * 100) / 100,
    p99Ms: Math.round(percentile(durations, 99) * 100) / 100,
    minMs: Math.round(durations[0] * 100) / 100,
    maxMs: Math.round(durations[durations.length - 1] * 100) / 100,
    opsPerSec: Math.round(iterations / (totalMs / 1000)),
  };
}

describe("Service Performance Benchmarks", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("JobService.list — avg under 5ms per call", async () => {
    const builder = createMockQueryBuilder({
      data: Array.from({ length: 20 }, (_, i) => ({
        id: `j${i}`,
        title: `Job ${i}`,
      })),
      count: 100,
    });
    const supabase = createMockSupabase({ jobs: builder });
    const { JobService } = await import("@/lib/services/JobService");

    const result = await benchmark(
      "JobService.list",
      () => JobService.list(supabase, { page: 1, limit: 20 }),
      200,
    );

    expect(result.avgMs).toBeLessThan(serviceBenchmarkLimits.listAvgMs);
    expect(result.p95Ms).toBeLessThan(serviceBenchmarkLimits.listP95Ms);
  });

  it("JobService.getById — avg under 2ms per call", async () => {
    const builder = createMockQueryBuilder({
      data: { id: "j1", title: "Engineer" },
    });
    const supabase = createMockSupabase({ jobs: builder });
    const { JobService } = await import("@/lib/services/JobService");

    const result = await benchmark(
      "JobService.getById",
      () => JobService.getById(supabase, "j1"),
      500,
    );

    expect(result.avgMs).toBeLessThan(serviceBenchmarkLimits.getByIdAvgMs);
    expect(result.opsPerSec).toBeGreaterThan(serviceBenchmarkLimits.getByIdMinOpsPerSec);
  });

  it("JobService.create — avg under 5ms per call", async () => {
    const builder = createMockQueryBuilder({
      data: { id: "j-new", title: "New" },
    });
    const supabase = createMockSupabase({ jobs: builder });
    const { JobService } = await import("@/lib/services/JobService");

    const result = await benchmark(
      "JobService.create",
      () => JobService.create(supabase, { title: "PM", description: "desc" }, "user-1", "org-1"),
      200,
    );

    expect(result.avgMs).toBeLessThan(serviceBenchmarkLimits.mutationAvgMs);
  });

  it("ApplicationService.listForCandidate — avg under 5ms", async () => {
    const builder = createMockQueryBuilder({
      data: [{ id: "a1", status: "applied" }],
      count: 1,
    });
    const supabase = createMockSupabase({ applications: builder });
    const { ApplicationService } = await import("@/lib/services/ApplicationService");

    const result = await benchmark(
      "ApplicationService.listForCandidate",
      () =>
        ApplicationService.listForCandidate(supabase, "c1", {
          page: 1,
          limit: 10,
        }),
      200,
    );

    expect(result.avgMs).toBeLessThan(serviceBenchmarkLimits.mutationAvgMs);
  });

  it("ApplicationService.listForRecruiter — avg under 5ms", async () => {
    const builder = createMockQueryBuilder({
      data: [{ id: "a1" }, { id: "a2" }],
      count: 2,
    });
    const supabase = createMockSupabase({ applications: builder });
    const { ApplicationService } = await import("@/lib/services/ApplicationService");

    const result = await benchmark(
      "ApplicationService.listForRecruiter",
      () => ApplicationService.listForRecruiter(supabase, { page: 1, limit: 20 }),
      200,
    );

    expect(result.avgMs).toBeLessThan(serviceBenchmarkLimits.mutationAvgMs);
  });
});
