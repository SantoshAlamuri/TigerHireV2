import { describe, it, expect, vi } from "vitest";
import { confirmPayouts, generateBatch, markBatchPaid } from "@/lib/services/ReferralPayoutService";

/**
 * The payout lifecycle that did not exist until 2026-08-01.
 *
 * `payout_ledger.status` was written 'pending' at creation and never written
 * again by anything, while four separate readers looked for 'paid'. These tests
 * pin the transitions that finally advance it, and the two places where getting
 * it wrong pays a referrer twice.
 */

type Captured = Record<string, unknown>;

/**
 * Minimal Supabase query-builder double. Each `from(table)` returns a thenable
 * chain; `captured` records the filters applied so a test can assert on the
 * predicates that carry the safety properties (e.g. `.is("batch_id", null)`).
 */
function makeClient(handlers: Record<string, (captured: Captured) => unknown>) {
  const calls: Captured[] = [];

  function chain(table: string) {
    const captured: Captured = { table, filters: [] as string[] };
    const record = (name: string) => (col: string, val?: unknown) => {
      (captured.filters as string[]).push(`${name}:${col}=${String(val)}`);
      return builder;
    };
    const builder: Record<string, unknown> = {
      select: (cols?: string) => {
        captured.select = cols;
        return builder;
      },
      insert: (payload: unknown) => {
        captured.insert = payload;
        return builder;
      },
      update: (payload: unknown) => {
        captured.update = payload;
        return builder;
      },
      delete: () => {
        captured.deleted = true;
        return builder;
      },
      eq: record("eq"),
      in: record("in"),
      is: record("is"),
      like: record("like"),
      order: () => builder,
      limit: () => builder,
      single: () => Promise.resolve(handlers[table]?.(captured)),
      maybeSingle: () => Promise.resolve(handlers[table]?.(captured)),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(handlers[table]?.(captured)).then(resolve),
    };
    calls.push(captured);
    return builder;
  }

  function rpc(fn: string, params: Record<string, unknown>) {
    const captured: Captured = { table: `rpc:${fn}`, rpcParams: params };
    calls.push(captured);
    return Promise.resolve(handlers[`rpc:${fn}`]?.(captured));
  }

  return { client: { from: chain, rpc } as never, calls };
}

describe("confirmPayouts", () => {
  it("only advances rows that are still pending", async () => {
    // Re-confirming a row already in a payout run must not reset it, so the
    // status predicate belongs in the write rather than a prior read.
    const { client, calls } = makeClient({
      payout_ledger: () => ({ data: [{ id: "l1" }], error: null }),
    });

    const result = await confirmPayouts(client, {
      ledgerIds: ["l1", "l2"],
      userId: "u1",
      organisationId: "org1",
      isSuperAdmin: true,
    });

    expect(result).toEqual({ confirmed: 1, skipped: 1 });
    const update = calls.find((c) => c.update);
    expect(update?.filters).toContain("eq:status=pending");
  });

  it("refuses rows whose job belongs to another organisation", async () => {
    const { client } = makeClient({
      payout_ledger: (c) =>
        c.update
          ? { data: [{ id: "mine" }], error: null }
          : {
              data: [
                { id: "mine", job_id: "j-mine" },
                { id: "theirs", job_id: "j-theirs" },
              ],
              error: null,
            },
      // Only j-mine comes back scoped to org1.
      jobs: () => ({ data: [{ id: "j-mine" }], error: null }),
    });

    const result = await confirmPayouts(client, {
      ledgerIds: ["mine", "theirs"],
      userId: "u1",
      organisationId: "org1",
      isSuperAdmin: false,
    });

    expect(result.confirmed).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("confirms nothing for a caller with no organisation", async () => {
    const { client } = makeClient({});
    const result = await confirmPayouts(client, {
      ledgerIds: ["l1"],
      userId: "u1",
      organisationId: null,
      isSuperAdmin: false,
    });
    expect(result).toEqual({ confirmed: 0, skipped: 1 });
  });
});

describe("generateBatch", () => {
  it("claims rows with an unbatched predicate rather than a read-then-write", async () => {
    // Two operators pressing Generate at once must take disjoint sets. The
    // `batch_id IS NULL` predicate on the UPDATE is what makes that true; a
    // select-then-update would let both claim the same referrer's bonus.
    const { client, calls } = makeClient({
      payout_batches: (c) =>
        c.insert || c.update
          ? {
              data: { id: "b1", reference: "PR-2026-08-0001", row_count: 2, total_amount: 3000 },
              error: null,
            }
          : { data: [], error: null },
      payout_ledger: () => ({
        data: [
          { id: "l1", amount: 1000 },
          { id: "l2", amount: 2000 },
        ],
        error: null,
      }),
    });

    const batch = await generateBatch(client, { userId: "u1", now: new Date("2026-08-01Z") });

    expect(batch?.reference).toBe("PR-2026-08-0001");
    const claim = calls.find((c) => c.table === "payout_ledger" && c.update);
    expect(claim?.filters).toContain("eq:status=confirmed");
    expect(claim?.filters).toContain("is:batch_id=null");
  });

  it("sums only the rows it actually claimed", async () => {
    const updates: Captured[] = [];
    const { client, calls } = makeClient({
      payout_batches: (c) => {
        if (c.update) updates.push(c);
        return {
          data: { id: "b1", reference: "PR-2026-08-0001", row_count: 2, total_amount: 3000 },
          error: null,
        };
      },
      payout_ledger: () => ({
        data: [
          { id: "l1", amount: 1000 },
          { id: "l2", amount: 2000 },
        ],
        error: null,
      }),
    });

    await generateBatch(client, { userId: "u1", now: new Date("2026-08-01Z") });

    const total = updates.find((u) => (u.update as Captured)?.total_amount !== undefined);
    expect((total?.update as Captured)?.total_amount).toBe(3000);
    expect((total?.update as Captured)?.row_count).toBe(2);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("discards a run that claimed nothing instead of leaving an empty artefact", async () => {
    const { client, calls } = makeClient({
      payout_batches: (c) =>
        c.insert
          ? { data: { id: "b1", reference: "PR-2026-08-0001" }, error: null }
          : { data: null, error: null },
      payout_ledger: () => ({ data: [], error: null }),
    });

    const batch = await generateBatch(client, { userId: "u1", now: new Date("2026-08-01Z") });

    expect(batch).toBeNull();
    expect(calls.some((c) => c.table === "payout_batches" && c.deleted)).toBe(true);
  });

  it("treats a null amount as zero rather than poisoning the total with NaN", async () => {
    const updates: Captured[] = [];
    const { client } = makeClient({
      payout_batches: (c) => {
        if (c.update) updates.push(c);
        return { data: { id: "b1", reference: "PR-2026-08-0001" }, error: null };
      },
      payout_ledger: () => ({
        data: [
          { id: "l1", amount: null },
          { id: "l2", amount: 500 },
        ],
        error: null,
      }),
    });

    await generateBatch(client, { userId: "u1", now: new Date("2026-08-01Z") });

    const total = updates.find((u) => (u.update as Captured)?.total_amount !== undefined);
    expect((total?.update as Captured)?.total_amount).toBe(500);
  });
});

describe("markBatchPaid", () => {
  it("settles batch + ledger atomically via mark_payout_batch_paid RPC", async () => {
    // The RPC (a single transaction) is now the write four readers were waiting
    // for — batch and ledger flip to 'paid' together, so they cannot diverge.
    const { client, calls } = makeClient({
      "rpc:mark_payout_batch_paid": () => ({
        data: [{ id: "b1", reference: "PR-2026-08-0001", row_count: 1, total_amount: 1000 }],
        error: null,
      }),
    });

    const batch = await markBatchPaid(client, {
      batchId: "b1",
      userId: "u1",
      paymentReference: "UTR123456",
    });

    expect(batch?.reference).toBe("PR-2026-08-0001");
    const rpcCall = calls.find((c) => c.table === "rpc:mark_payout_batch_paid");
    expect(rpcCall).toBeTruthy();
    expect((rpcCall?.rpcParams as Record<string, unknown>)?.p_batch_id).toBe("b1");
    expect((rpcCall?.rpcParams as Record<string, unknown>)?.p_payment_reference).toBe("UTR123456");
    // No direct two-step writes anymore — the ledger update happens inside the RPC.
    expect(calls.some((c) => c.table === "payout_ledger" && c.update)).toBe(false);
  });

  it("returns null when the run is not open (RPC returns no rows)", async () => {
    const { client } = makeClient({
      "rpc:mark_payout_batch_paid": () => ({ data: [], error: null }),
    });

    const batch = await markBatchPaid(client, {
      batchId: "b1",
      userId: "u1",
      paymentReference: "UTR123456",
    });

    expect(batch).toBeNull();
  });
});

describe("payout-trigger records the job the bonus was earned on", () => {
  it("writes job_id onto the ledger row", async () => {
    // payout_export used to recover the job by picking the candidate's most
    // recently updated application, which names the wrong role for anyone who
    // applied twice — and that title is what finance allocates the cost to.
    const upserts: Captured[] = [];

    const client = {
      from(table: string) {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: () => {
            if (table === "job_referral_config") {
              return Promise.resolve({
                data: {
                  bonus_trigger: "shortlisted",
                  direct_bonus_amount: 5000,
                  employee_bonus_amount: 0,
                  parent_bonus_amount: 0,
                  candidate_referrer_bonus_amount: 0,
                  candidate_referrer_enabled: false,
                  bonus_currency: "INR",
                },
                error: null,
              });
            }
            if (table === "applications") {
              return Promise.resolve({
                data: { direct_referrer_id: "ref-1", parent_referrer_id: null },
                error: null,
              });
            }
            if (table === "referrers") {
              return Promise.resolve({
                data: { org_verified: false, type: "public" },
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: null });
          },
          // The real client returns a builder here, and the ledger writer chains
          // `.select("id")` to learn whether a row was actually inserted. A mock
          // that resolves straight to `{error}` makes that call throw, which
          // createMilestonePayouts catches — so the payout silently does not
          // happen and the assertions below still pass. Mirror the real shape.
          upsert: (payload: Captured) => {
            upserts.push(payload);
            return {
              select: () => Promise.resolve({ data: [{ id: "ledger-row-1" }], error: null }),
            };
          },
        };
        return builder;
      },
    } as never;

    vi.doMock("@/lib/agents/employee-referral-attribution", () => ({
      bridgeEmployeeReferralAttribution: vi.fn().mockResolvedValue(undefined),
    }));
    const { triggerPayoutIfEligible } = await import("@/lib/agents/payout-trigger");

    await triggerPayoutIfEligible({
      supabase: client,
      candidateId: "cand-1",
      jobId: "job-42",
      newStatus: "shortlisted",
    });

    expect(upserts).toHaveLength(1);
    expect(upserts[0].job_id).toBe("job-42");
    expect(upserts[0].candidate_id).toBe("cand-1");
    expect(upserts[0].status).toBe("pending");
    vi.resetModules();
  });
});
