import { describe, it, expect, vi, beforeEach } from "vitest";

// Resolves to a count of ledger rows written, matching createMilestonePayouts'
// contract. One direct referrer per hire in these fixtures.
const createMilestonePayouts = vi.fn().mockResolvedValue(1);
vi.mock("@/lib/agents/payout-milestone", () => ({ createMilestonePayouts }));

const { day90Cutoff, findDueDay90Hires, runDay90Sweep } =
  await import("@/lib/referrals/day90-sweep");

/**
 * Day 90 paid nobody for five months: payout-trigger maps status changes to two
 * events, so 'day_90' matched nothing. These tests pin the two decisions that
 * make the replacement honest — it counts from the recorded joining date, and a
 * hire without one is reported rather than swept in on a guess.
 */

type Captured = { table: string; filters: string[] };

function makeClient(rows: {
  configs?: { job_id: string }[];
  hires?: { candidate_id: string; job_id: string; joined_at: string }[];
  awaitingCount?: number;
}) {
  const calls: Captured[] = [];

  function chain(table: string) {
    const captured: Captured = { table, filters: [] };
    calls.push(captured);
    const record = (name: string) => (col: string, val?: unknown) => {
      captured.filters.push(`${name}:${col}=${String(val)}`);
      return builder;
    };
    const result =
      table === "job_referral_config"
        ? { data: rows.configs ?? [], error: null }
        : { data: rows.hires ?? [], error: null, count: rows.awaitingCount ?? 0 };

    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: record("eq"),
      in: record("in"),
      is: record("is"),
      not: record("not"),
      lte: record("lte"),
      limit: () => Promise.resolve(result),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    return builder;
  }

  return { client: { from: chain } as never, calls };
}

beforeEach(() => {
  createMilestonePayouts.mockClear();
  // mockClear leaves the resolved value in place, so a test that overrides it
  // would otherwise leak into every test declared after it.
  createMilestonePayouts.mockResolvedValue(1);
});

describe("day90Cutoff", () => {
  it("is ninety days before now, as a plain date", () => {
    expect(day90Cutoff(new Date("2026-08-01T12:00:00Z"))).toBe("2026-05-03");
  });
});

describe("findDueDay90Hires", () => {
  it("returns nothing when no job pays on day 90", async () => {
    const { client } = makeClient({ configs: [] });
    const due = await findDueDay90Hires(client, new Date("2026-08-01Z"));
    expect(due).toEqual([]);
  });

  it("counts from joined_at and excludes hires with none recorded", async () => {
    // The `not joined_at is null` + `lte joined_at cutoff` pair is the whole
    // safety property: no joining date means not due, never due-today.
    const { client, calls } = makeClient({
      configs: [{ job_id: "j1" }],
      hires: [{ candidate_id: "c1", job_id: "j1", joined_at: "2026-01-01" }],
    });

    const due = await findDueDay90Hires(client, new Date("2026-08-01T00:00:00Z"));

    expect(due).toEqual([{ candidateId: "c1", jobId: "j1" }]);
    const hireQuery = calls.find((c) => c.table === "pipeline_candidates");
    expect(hireQuery?.filters).toContain("eq:status=hired");
    expect(hireQuery?.filters).toContain("not:joined_at=is");
    expect(hireQuery?.filters).toContain("lte:joined_at=2026-05-03");
  });

  it("only looks at jobs whose config pays on day 90", async () => {
    const { client, calls } = makeClient({ configs: [{ job_id: "j1" }] });
    await findDueDay90Hires(client, new Date("2026-08-01Z"));
    const cfg = calls.find((c) => c.table === "job_referral_config");
    expect(cfg?.filters).toContain("eq:bonus_trigger=day_90");
  });
});

describe("runDay90Sweep", () => {
  it("creates a day_90 payout for each due hire", async () => {
    const { client } = makeClient({
      configs: [{ job_id: "j1" }],
      hires: [
        { candidate_id: "c1", job_id: "j1", joined_at: "2026-01-01" },
        { candidate_id: "c2", job_id: "j1", joined_at: "2026-02-01" },
      ],
    });

    const result = await runDay90Sweep(client, new Date("2026-08-01Z"));

    expect(result.due).toBe(2);
    expect(result.processed).toBe(2);
    expect(result.paid).toBe(2);
    expect(createMilestonePayouts).toHaveBeenCalledTimes(2);
    expect(createMilestonePayouts.mock.calls[0][0]).toMatchObject({
      candidateId: "c1",
      jobId: "j1",
      triggerEvent: "day_90",
      attributionStatus: "hired",
    });
  });

  it("reports zero paid on a re-run, and still reports the hires it visited", async () => {
    // The sweep keeps no "already swept" state — it re-offers the same hires
    // every night and the unique index absorbs them. Counting iterations would
    // therefore report the same payouts forever. `paid` is what the ledger
    // actually accepted; `processed` is what was looked at.
    createMilestonePayouts.mockResolvedValue(0);
    const { client } = makeClient({
      configs: [{ job_id: "j1" }],
      hires: [
        { candidate_id: "c1", job_id: "j1", joined_at: "2026-01-01" },
        { candidate_id: "c2", job_id: "j1", joined_at: "2026-02-01" },
      ],
    });

    const result = await runDay90Sweep(client, new Date("2026-08-01Z"));

    expect(result.due).toBe(2);
    expect(result.processed).toBe(2);
    expect(result.paid).toBe(0);
  });

  it("reports hires that are stuck for want of a joining date", async () => {
    // The original bug was a payout that silently never happened. A hire whose
    // start date nobody recorded is that same silence in a new place, so it is
    // counted and warned on every run instead of vanishing.
    const { client } = makeClient({
      configs: [{ job_id: "j1" }],
      hires: [],
      awaitingCount: 3,
    });

    const result = await runDay90Sweep(client, new Date("2026-08-01Z"));

    expect(result.paid).toBe(0);
    expect(result.skippedNoJoinDate).toBe(3);
  });

  it("does nothing when no job is configured for day 90", async () => {
    const { client } = makeClient({ configs: [] });
    const result = await runDay90Sweep(client, new Date("2026-08-01Z"));
    expect(result).toEqual({ due: 0, processed: 0, paid: 0, skippedNoJoinDate: 0 });
    expect(createMilestonePayouts).not.toHaveBeenCalled();
  });
});
