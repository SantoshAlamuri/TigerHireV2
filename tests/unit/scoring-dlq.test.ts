import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();

vi.mock("@/lib/observability/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("pushScoringDlq", () => {
  beforeEach(() => {
    mockInsert.mockReset();
    mockInsert.mockResolvedValue({ error: null });
  });

  it("inserts DLQ row with truncated error message", async () => {
    const supabase = {
      from: () => ({
        insert: mockInsert,
      }),
    };

    const { pushScoringDlq } = await import("@/lib/observability/scoring-dlq");
    await pushScoringDlq(supabase as never, {
      jobId: "job-1",
      candidateId: "cand-1",
      route: "POST /api/fitscore/score",
      errorMessage: "x".repeat(2000),
      organisationId: "org-1",
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        job_id: "job-1",
        candidate_id: "cand-1",
        route: "POST /api/fitscore/score",
        organisation_id: "org-1",
        error_message: "x".repeat(1000),
      }),
    );
  });
});
