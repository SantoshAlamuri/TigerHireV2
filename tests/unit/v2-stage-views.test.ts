import { describe, it, expect } from "vitest";
import { STAGE_VIEWS, resolveStageView, stageQuery } from "@/lib/v2/stage-views";

/**
 * Every number on the Job Dashboard must be a door — clicking "Applied 312"
 * opens the 312. These map a URL slug to the query behind the tile, so the
 * count on the dashboard and the list you land on can never disagree.
 */
describe("stage views", () => {
  it("exposes the pipeline tiles in funnel order", () => {
    expect(STAGE_VIEWS.map((v) => v.slug)).toEqual([
      "applied",
      "screened",
      "review",
      "shortlisted",
      "hired",
    ]);
  });

  it("resolves a known slug", () => {
    expect(resolveStageView("shortlisted")?.title).toMatch(/shortlist/i);
  });

  it("returns null for an unknown slug rather than guessing", () => {
    expect(resolveStageView("nonsense")).toBeNull();
    expect(resolveStageView("")).toBeNull();
  });

  it("asks for every application on the applied tile — no status filter", () => {
    expect(stageQuery("applied", "job-1")).toEqual({ jobId: "job-1", limit: 100 });
  });

  it("filters by status for the narrower tiles", () => {
    expect(stageQuery("review", "job-1")).toEqual({
      jobId: "job-1",
      limit: 100,
      status: "applied",
    });
    expect(stageQuery("shortlisted", "job-1")).toEqual({
      jobId: "job-1",
      limit: 100,
      status: "shortlisted",
    });
    expect(stageQuery("hired", "job-1")).toEqual({ jobId: "job-1", limit: 100, status: "hired" });
  });

  it("never builds a query for an unknown slug", () => {
    expect(stageQuery("nonsense", "job-1")).toBeNull();
  });

  it("gives every tile a human title and an empty-state line", () => {
    for (const v of STAGE_VIEWS) {
      expect(v.title.length).toBeGreaterThan(0);
      expect(v.emptyLine.length).toBeGreaterThan(0);
    }
  });
});
