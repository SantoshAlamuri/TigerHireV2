/**
 * Market score integrity:
 * - pool is scoped to the candidate's organisation (no cross-tenant rows in rankings);
 * - the candidate's own persisted fit_scores rows are excluded from the pool;
 * - pools below COLD_START_THRESHOLD (25) make no percentile claim;
 * - pools below 50 never claim better than the "Top 25%" tier and carry a pool-size qualifier.
 */

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeMarketScore } from "@/lib/fitscore/hybrid/market-score";

type FilterCall = { method: string; args: unknown[] };

function makeSupabase(params: {
  roleFunction: string | null;
  jobRows: Array<{ id: string }>;
  poolRows: Array<{ overall_score: number }>;
}) {
  const jobsFilterCalls: FilterCall[] = [];
  const poolFilterCalls: FilterCall[] = [];

  function chain(calls: FilterCall[], result: unknown) {
    const proxy: Record<string, unknown> = {};
    for (const method of ["select", "eq", "neq", "is", "in", "order", "limit"]) {
      proxy[method] = (...args: unknown[]) => {
        if (method !== "select") calls.push({ method, args });
        return proxy;
      };
    }
    proxy.single = async () => ({
      data: result === null ? null : { role_function: params.roleFunction },
      error: null,
    });
    // The pool/jobs list queries are awaited directly — make the chain thenable.
    (proxy as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
      resolve({ data: result, error: null });
    return proxy;
  }

  let jobsCallCount = 0;
  const client = {
    from: (table: string) => {
      if (table === "jobs") {
        jobsCallCount += 1;
        // First jobs call fetches role_function via .single(); second lists pool job ids.
        return jobsCallCount === 1
          ? chain(jobsFilterCalls, params.roleFunction === null ? null : params.jobRows)
          : chain(jobsFilterCalls, params.jobRows);
      }
      return chain(poolFilterCalls, params.poolRows);
    },
  } as unknown as SupabaseClient;

  return { client, jobsFilterCalls, poolFilterCalls };
}

const context = { organisationId: "org-1", candidateId: "cand-self" };

function poolOf(n: number, scores?: number[]): Array<{ overall_score: number }> {
  return Array.from({ length: n }, (_, i) => ({
    overall_score: scores?.[i] ?? 30 + ((i * 7) % 60),
  }));
}

describe("computeMarketScore", () => {
  it("scopes the job pool to the candidate's organisation", async () => {
    const { client, jobsFilterCalls } = makeSupabase({
      roleFunction: "engineering",
      jobRows: [{ id: "job-1" }],
      poolRows: poolOf(60),
    });
    await computeMarketScore(70, "job-1", client, context);

    const orgFilter = jobsFilterCalls.find(
      (c) => c.method === "eq" && c.args[0] === "organisation_id",
    );
    expect(orgFilter).toBeDefined();
    expect(orgFilter?.args[1]).toBe("org-1");
  });

  it("excludes the candidate's own fit_scores rows from the pool", async () => {
    const { client, poolFilterCalls } = makeSupabase({
      roleFunction: "engineering",
      jobRows: [{ id: "job-1" }],
      poolRows: poolOf(60),
    });
    await computeMarketScore(70, "job-1", client, context);

    const selfFilter = poolFilterCalls.find(
      (c) => c.method === "neq" && c.args[0] === "candidate_id",
    );
    expect(selfFilter).toBeDefined();
    expect(selfFilter?.args[1]).toBe("cand-self");
  });

  it("returns cold-start (no percentile claim) for pools under 25", async () => {
    const { client } = makeSupabase({
      roleFunction: "engineering",
      jobRows: [{ id: "job-1" }],
      poolRows: poolOf(20),
    });
    const market = await computeMarketScore(95, "job-1", client, context);

    expect(market.percentile).toBeNull();
    expect(market.topPct).toBeNull();
    expect(market.label).toBe("Market data building...");
    expect(market.poolSize).toBe(20);
  });

  it("never claims better than Top 25% for pools under 50, with a pool-size qualifier", async () => {
    // 30 candidates, our score of 99 beats all of them → raw topPct would be "Top 5%".
    const { client } = makeSupabase({
      roleFunction: "engineering",
      jobRows: [{ id: "job-1" }],
      poolRows: poolOf(
        30,
        Array.from({ length: 30 }, (_, i) => 30 + i),
      ),
    });
    const market = await computeMarketScore(99, "job-1", client, context);

    expect(market.percentile).toBe(100);
    expect(market.label).toBe("Top 25% - Strong (pool of 30)");
    expect(market.label).not.toContain("Top 5%");
    expect(market.label).not.toContain("Exceptional");
  });

  it("qualifies mid-tier labels too on small pools", async () => {
    const scores = Array.from({ length: 30 }, (_, i) => 30 + i * 2); // 30..88
    const { client } = makeSupabase({
      roleFunction: "engineering",
      jobRows: [{ id: "job-1" }],
      poolRows: poolOf(30, scores),
    });
    const market = await computeMarketScore(60, "job-1", client, context);
    expect(market.label).toContain("(pool of 30)");
  });

  it("keeps full tier labels for pools of 50 or more", async () => {
    const scores = Array.from({ length: 60 }, (_, i) => 20 + i); // 20..79
    const { client } = makeSupabase({
      roleFunction: "engineering",
      jobRows: [{ id: "job-1" }],
      poolRows: poolOf(60, scores),
    });
    const market = await computeMarketScore(99, "job-1", client, context);

    expect(market.poolSize).toBe(60);
    expect(market.label).toBe("Top 5% - Exceptional");
    expect(market.label).not.toContain("pool of");
  });

  it("returns cold-start when the job has no role_function", async () => {
    const { client } = makeSupabase({
      roleFunction: null,
      jobRows: [],
      poolRows: [],
    });
    const market = await computeMarketScore(70, "job-1", client, context);
    expect(market.percentile).toBeNull();
    expect(market.label).toBe("Market data building...");
  });
});
