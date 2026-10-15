import { describe, expect, it } from "vitest";
import { resolveStageEnteredAtIso } from "@/lib/pipeline/stage-entered-at";

describe("resolveStageEnteredAtIso", () => {
  it("prefers the latest transition for the current stage name", () => {
    const entered = resolveStageEnteredAtIso({
      pipelineCandidateId: "pc-1",
      currentStageName: "Interview",
      transitions: [
        {
          pipeline_candidate_id: "pc-1",
          to_stage: "Applied",
          entered_at: "2026-01-01T00:00:00.000Z",
        },
        {
          pipeline_candidate_id: "pc-1",
          to_stage: "Interview",
          entered_at: "2026-03-01T00:00:00.000Z",
        },
        {
          pipeline_candidate_id: "pc-1",
          to_stage: "Interview",
          entered_at: "2026-03-10T00:00:00.000Z",
        },
      ],
      applicationAppliedAt: "2026-02-01T00:00:00.000Z",
      pipelineCandidateCreatedAt: "2026-01-15T00:00:00.000Z",
    });

    expect(entered).toBe("2026-03-10T00:00:00.000Z");
  });

  it("falls back to application applied_at when no transition matches", () => {
    const entered = resolveStageEnteredAtIso({
      pipelineCandidateId: "pc-1",
      currentStageName: "Offer",
      transitions: [
        {
          pipeline_candidate_id: "pc-1",
          to_stage: "Interview",
          entered_at: "2026-03-01T00:00:00.000Z",
        },
      ],
      applicationAppliedAt: "2026-02-15T00:00:00.000Z",
      pipelineCandidateCreatedAt: "2026-02-01T00:00:00.000Z",
    });

    expect(entered).toBe("2026-02-15T00:00:00.000Z");
  });
});
