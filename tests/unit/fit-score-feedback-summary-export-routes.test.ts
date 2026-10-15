import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, superAdminCtx } from "../helpers";

const mockGetAuthContext = vi.fn();
const mockAssertJobAccess = vi.fn();
const mockCreateSupabaseAdmin = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  jsonError: (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), { status }),
  jsonSuccess: (data: unknown, status = 200) => new Response(JSON.stringify(data), { status }),
  handleApiError: (_err: unknown, msg: string) =>
    new Response(JSON.stringify({ error: msg }), { status: 500 }),
}));

vi.mock("@/lib/job-access", () => ({
  assertJobAccess: (...args: unknown[]) => mockAssertJobAccess(...args),
}));

function makeThenable(result: { data: unknown; error: unknown }) {
  const promise = Promise.resolve(result);
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.then = (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    promise.then(onFulfilled, onRejected);
  return chain;
}

const outcomesBuilder = makeThenable({ data: [], error: null });
const actionsBuilder = makeThenable({ data: [], error: null });
const mockFrom = vi.fn((table: string) =>
  table === "hiring_outcomes" ? outcomesBuilder : actionsBuilder,
);

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

describe("fit-score feedback summary/export routes", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockAssertJobAccess.mockReset();
    mockFrom.mockClear();
    (outcomesBuilder.eq as ReturnType<typeof vi.fn>).mockClear();
    (actionsBuilder.eq as ReturnType<typeof vi.fn>).mockClear();
    mockCreateSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn().mockResolvedValue({ error: null }),
      })),
    });
  });

  it("summary returns accumulating for role_family below threshold", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const outcomes = makeThenable({
      data: Array.from({ length: 3 }).map((_, i) => ({
        outcome: i % 2 === 0 ? "hired" : "rejected",
        accuracy_signal: "accurate",
        scoring_version: 2,
        fit_score_value: 70,
        feedback_reason: "skill_gap",
        jobs: { role_function: "Engineering" },
      })),
      error: null,
    });
    const actions = makeThenable({
      data: [{ action: "shortlist", scoring_version: 2, jobs: { role_function: "Engineering" } }],
      error: null,
    });
    mockFrom.mockImplementation((table: string) =>
      table === "hiring_outcomes" ? outcomes : actions,
    );

    const { GET } = await import("@/app/api/fit-score/feedback/summary/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/fit-score/feedback/summary"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role_families).toHaveLength(1);
    expect(body.role_families[0]).toMatchObject({
      role_family: "Engineering",
      status: "accumulating",
      feedback_count: 3,
      threshold: 200,
    });
    expect((outcomes.eq as ReturnType<typeof vi.fn>).mock.calls).toContainEqual([
      "organisation_id",
      recruiterCtx.organisationId,
    ]);
  });

  it("summary returns active stats for role_family at or above threshold", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const outcomes = makeThenable({
      data: [
        ...Array.from({ length: 150 }).map(() => ({
          outcome: "hired",
          accuracy_signal: "accurate",
          scoring_version: 2,
          fit_score_value: 82,
          feedback_reason: "skill_gap",
          jobs: { role_function: "Engineering" },
        })),
        ...Array.from({ length: 30 }).map(() => ({
          outcome: "rejected",
          accuracy_signal: "too_high",
          scoring_version: 2,
          fit_score_value: 55,
          feedback_reason: "domain_mismatch",
          jobs: { role_function: "Engineering" },
        })),
        ...Array.from({ length: 20 }).map(() => ({
          outcome: "rejected",
          accuracy_signal: "too_low",
          scoring_version: 1,
          fit_score_value: 46,
          feedback_reason: "experience_level_mismatch",
          jobs: { role_function: "Engineering" },
        })),
      ],
      error: null,
    });
    const actions = makeThenable({ data: [], error: null });
    mockFrom.mockImplementation((table: string) =>
      table === "hiring_outcomes" ? outcomes : actions,
    );

    const { GET } = await import("@/app/api/fit-score/feedback/summary/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/fit-score/feedback/summary"));
    expect(res.status).toBe(200);
    const body = await res.json();
    const family = body.role_families[0];
    expect(family.status).toBe("active");
    expect(family.feedback_count).toBe(200);
    expect(family.accuracy_rate).toBe(0.75);
    expect(family.too_high_rate).toBe(0.15);
    expect(family.too_low_rate).toBe(0.1);
    expect(family.top_reasons).toContain("skill_gap");
  });

  it("export excludes low-signal role families by default", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const outcomes = makeThenable({
      data: [
        ...Array.from({ length: 200 }).map((_, i) => ({
          organisation_id: "org-1",
          job_id: "job-hi",
          candidate_id: `cand-hi-${i}`,
          fit_score_id: `fs-hi-${i}`,
          fit_score_value: 71,
          scoring_version: 2,
          accuracy_signal: "accurate",
          feedback_reason: "domain_mismatch",
          note: null,
          outcome: "hired",
          source: "application_service",
          source_event_id: `application:1:hired:${i}`,
          submitted_by: "user-1",
          recorded_by: "user-1",
          created_at: "2026-03-28T00:00:00.000Z",
          recorded_at: "2026-03-28T00:00:00.000Z",
          jobs: { role_function: "Engineering" },
        })),
        ...Array.from({ length: 10 }).map((_, i) => ({
          organisation_id: "org-1",
          job_id: "job-lo",
          candidate_id: `cand-lo-${i}`,
          fit_score_id: `fs-lo-${i}`,
          fit_score_value: 40,
          scoring_version: 2,
          accuracy_signal: "too_high",
          feedback_reason: "skill_gap",
          note: null,
          outcome: "rejected",
          source: "application_service",
          source_event_id: `application:2:rejected:${i}`,
          submitted_by: "user-1",
          recorded_by: "user-1",
          created_at: "2026-03-28T00:00:00.000Z",
          recorded_at: "2026-03-28T00:00:00.000Z",
          jobs: { role_function: "Sales" },
        })),
      ],
      error: null,
    });
    const actions = makeThenable({ data: [], error: null });
    mockFrom.mockImplementation((table: string) =>
      table === "hiring_outcomes" ? outcomes : actions,
    );

    const { GET } = await import("@/app/api/fit-score/feedback/export/route");
    const res = await GET(
      new NextRequest("http://localhost:3000/api/fit-score/feedback/export?format=json"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows.every((r: { role_family: string }) => r.role_family === "Engineering")).toBe(
      true,
    );
  });

  it("export includes low-signal families with warning when include_low_signal=true", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const outcomes = makeThenable({
      data: [
        {
          organisation_id: "org-1",
          job_id: "job-1",
          candidate_id: "cand-1",
          fit_score_id: "fs-1",
          fit_score_value: 71,
          scoring_version: 2,
          accuracy_signal: "too_low",
          feedback_reason: "domain_mismatch",
          note: null,
          outcome: "hired",
          source: "application_service",
          source_event_id: "application:1:hired",
          submitted_by: "user-1",
          recorded_by: "user-1",
          created_at: "2026-03-28T00:00:00.000Z",
          recorded_at: "2026-03-28T00:00:00.000Z",
          jobs: { role_function: "Sales" },
        },
      ],
      error: null,
    });
    const actions = makeThenable({ data: [], error: null });
    mockFrom.mockImplementation((table: string) =>
      table === "hiring_outcomes" ? outcomes : actions,
    );

    const { GET } = await import("@/app/api/fit-score/feedback/export/route");
    const res = await GET(
      new NextRequest(
        "http://localhost:3000/api/fit-score/feedback/export?format=json&include_low_signal=true",
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].role_family).toBe("Sales");
    expect(body.rows[0].low_signal_warning).toBe(true);
  });
});
