import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function buildChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
    insert: vi.fn().mockResolvedValue({ error: null }),
  };
  return chain;
}

describe("recordPipelineActionSignals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captures latest fit score snapshot and inserts one row per action entry", async () => {
    const fitScoresResult = {
      data: [
        {
          id: "fs-new",
          candidate_id: "cand-1",
          primary_score: 72,
          overall_score: 80,
          scoring_version: 2,
          created_at: "2026-03-28T12:00:00.000Z",
        },
        {
          id: "fs-old",
          candidate_id: "cand-1",
          primary_score: 65,
          overall_score: 70,
          scoring_version: 1,
          created_at: "2026-03-27T12:00:00.000Z",
        },
      ],
      error: null,
    };
    const fitScoresChain = buildChain(fitScoresResult);
    const insertChain = buildChain({ data: null, error: null });
    const from = vi
      .fn()
      .mockImplementation((table: string) =>
        table === "fit_scores" ? fitScoresChain : insertChain,
      );
    const admin = { from };

    const { recordPipelineActionSignals } = await import("@/lib/services/pipeline-action-signals");
    await recordPipelineActionSignals(admin as never, {
      jobId: "job-1",
      organisationId: "org-1",
      action: "shortlist",
      submittedBy: "user-1",
      entries: [{ candidateId: "cand-1", pipelineCandidateId: "pc-1" }],
    });

    const inserted = (insertChain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<
      Record<string, unknown>
    >;
    expect(inserted).toHaveLength(1);
    expect(inserted[0].fit_score_id).toBe("fs-new");
    expect(inserted[0].fit_score_value).toBe(72);
    expect(inserted[0].scoring_version).toBe(2);
    expect(inserted[0].action).toBe("shortlist");
  });
});
