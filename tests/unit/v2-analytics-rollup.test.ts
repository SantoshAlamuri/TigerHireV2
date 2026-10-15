import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAnalyticsRollup, MAX_ROLLUP_ROWS } from "@/lib/v2/analytics-rollup";
import { ANALYTICS_PAGE_SIZE } from "@/lib/analytics/fetch-paged";

/**
 * The analytics screen derived org funnel conversion, source of hire, reject
 * mix, score bands and time-to-decision from `/api/applications?limit=100`.
 * These cover the three things that made that wrong and are easy to regress
 * back into: stopping at the first page, ignoring the period, and losing the
 * tenant boundary.
 */

interface Recorded {
  table: string;
  filters: [string, string, unknown][];
  order: string | null;
  range: [number, number] | null;
}

function rawRow(i: number, over: Record<string, unknown> = {}) {
  return {
    id: `app-${String(i).padStart(6, "0")}`,
    job_id: "job-1",
    status: "applied",
    source: "referral",
    rejection_reason: null,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-02T00:00:00.000Z",
    offer_accepted_at: null,
    fit_scores: { overall_score: 72 },
    application_screening_answers: [],
    jobs: { id: "job-1", title: "Backend Engineer", created_at: "2026-04-01T00:00:00.000Z" },
    ...over,
  };
}

function makeDb(rows: unknown[], opts: { openJobs?: number | null } = {}) {
  const recorded: Recorded[] = [];
  const from = (table: string) => {
    const rec: Recorded = { table, filters: [], order: null, range: null };
    recorded.push(rec);
    const push = (op: string) => (col: string, val: unknown) => {
      rec.filters.push([op, col, val]);
      return builder;
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: push("eq"),
      gte: push("gte"),
      lt: push("lt"),
      order: (col: string) => {
        rec.order = col;
        return builder;
      },
      range: (a: number, b: number) => {
        rec.range = [a, b];
        return builder;
      },
      then: (resolve: (v: unknown) => unknown) => {
        if (table === "jobs") {
          return resolve(
            opts.openJobs === null
              ? { count: null, error: { message: "count failed" } }
              : { count: opts.openJobs ?? 0, error: null },
          );
        }
        const start = rec.range?.[0] ?? 0;
        return resolve({ data: rows.slice(start, start + ANALYTICS_PAGE_SIZE), error: null });
      },
    };
    return builder;
  };
  return { db: { from } as unknown as SupabaseClient, recorded };
}

const SCOPE = {
  orgId: "org-1",
  hiringManagerId: null,
  from: "2026-04-01",
  to: "2026-07-01",
};

describe("analytics rollup paging", () => {
  it("reads past the first page instead of reporting it as the total", async () => {
    const rows = Array.from({ length: ANALYTICS_PAGE_SIZE * 2 + 137 }, (_, i) => rawRow(i));
    const { db, recorded } = makeDb(rows);

    const out = await loadAnalyticsRollup(db, SCOPE);

    expect(out.rows).toHaveLength(ANALYTICS_PAGE_SIZE * 2 + 137);
    expect(out.complete).toBe(true);
    // Three application pages, then the open-job count.
    expect(recorded.filter((r) => r.table === "applications")).toHaveLength(3);
  });

  it("pages on id, so a tie on created_at cannot skip or duplicate a row", async () => {
    const { db, recorded } = makeDb([rawRow(0)]);
    await loadAnalyticsRollup(db, SCOPE);
    expect(recorded.find((r) => r.table === "applications")?.order).toBe("id");
  });

  it("reports complete:false rather than under-counting at the cap", async () => {
    const rows = Array.from({ length: MAX_ROLLUP_ROWS + ANALYTICS_PAGE_SIZE }, (_, i) => rawRow(i));
    const { db } = makeDb(rows);

    const out = await loadAnalyticsRollup(db, SCOPE);

    expect(out.complete).toBe(false);
    expect(out.rows.length).toBeGreaterThanOrEqual(MAX_ROLLUP_ROWS);
  });
});

describe("analytics rollup scoping", () => {
  it("scopes to the organisation and the requested period", async () => {
    const { db, recorded } = makeDb([rawRow(0)]);
    await loadAnalyticsRollup(db, SCOPE);

    const apps = recorded.find((r) => r.table === "applications")!;
    expect(apps.filters).toContainEqual(["eq", "jobs.organisation_id", "org-1"]);
    expect(apps.filters).toContainEqual(["gte", "created_at", "2026-04-01"]);
    // Exclusive end — an inclusive one counts the boundary day into two periods.
    expect(apps.filters).toContainEqual(["lt", "created_at", "2026-07-01"]);
  });

  it("restricts a hiring manager to the jobs they own", async () => {
    const { db, recorded } = makeDb([rawRow(0)]);
    await loadAnalyticsRollup(db, { ...SCOPE, hiringManagerId: "hm-9" });

    expect(recorded.find((r) => r.table === "applications")!.filters).toContainEqual([
      "eq",
      "jobs.hiring_manager_id",
      "hm-9",
    ]);
    // ...and to their own open-job count, which is the fill-rate denominator.
    expect(recorded.find((r) => r.table === "jobs")!.filters).toContainEqual([
      "eq",
      "hiring_manager_id",
      "hm-9",
    ]);
  });

  it("applies no period filter for all-time", async () => {
    const { db, recorded } = makeDb([rawRow(0)]);
    await loadAnalyticsRollup(db, { ...SCOPE, from: null, to: null });

    const apps = recorded.find((r) => r.table === "applications")!;
    expect(apps.filters.some(([op]) => op === "gte" || op === "lt")).toBe(false);
  });
});

describe("analytics rollup shaping", () => {
  it("hoists job title and date out of the rows", async () => {
    const { db } = makeDb([rawRow(0)]);
    const out = await loadAnalyticsRollup(db, SCOPE);

    expect(out.jobs["job-1"]).toEqual({
      title: "Backend Engineer",
      createdAt: "2026-04-01T00:00:00.000Z",
    });
  });

  it("reads a to-one embed PostgREST returned as an array", async () => {
    const { db } = makeDb([rawRow(0, { fit_scores: [{ overall_score: 91 }] })]);
    const out = await loadAnalyticsRollup(db, SCOPE);
    expect(out.rows[0].score).toBe(91);
  });

  it("distinguishes an unscored application from a zero", async () => {
    const { db } = makeDb([rawRow(0, { fit_scores: null })]);
    const out = await loadAnalyticsRollup(db, SCOPE);
    expect(out.rows[0].score).toBeNull();
  });

  it("marks an application screened only when an answer exists", async () => {
    const { db } = makeDb([
      rawRow(0, { application_screening_answers: [{ application_id: "app-000000" }] }),
      rawRow(1),
    ]);
    const out = await loadAnalyticsRollup(db, SCOPE);
    expect(out.rows.map((r) => r.screened)).toEqual([true, false]);
  });
});

describe("analytics rollup open-job count", () => {
  it("counts open jobs exactly rather than measuring a capped list", async () => {
    const { db } = makeDb([rawRow(0)], { openJobs: 137 });
    const out = await loadAnalyticsRollup(db, SCOPE);
    expect(out.openJobCount).toBe(137);
  });

  it("returns null, not zero, when the count fails — fill rate divides by it", async () => {
    const { db } = makeDb([rawRow(0)], { openJobs: null });
    const out = await loadAnalyticsRollup(db, SCOPE);
    expect(out.openJobCount).toBeNull();
    // The rows themselves are still good; only the denominator is unknown.
    expect(out.rows).toHaveLength(1);
  });
});
