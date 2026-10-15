import { describe, expect, it } from "vitest";
import {
  buildHybridJdBaseRubricSnapshot,
  HYBRID_JD_BASE_LINEAGE_BACKFILL_ACCURATE,
  HYBRID_JD_BASE_LINEAGE_CAPTURED,
  HYBRID_JD_BASE_RUBRIC_SNAPSHOT_SCHEMA_VERSION,
  isFitScoreJdBaseStale,
} from "@/lib/fitscore/hybrid/rubric-snapshot";
import type { JDBaseDocument } from "@/lib/fitscore/hybrid/types";

const sampleJdBase: JDBaseDocument = {
  id: "8bc2e7d0-3ae7-4a28-9e0c-14c76e9d3d3e",
  jobId: "fef1393c-812b-4fcb-b0ea-57fe59f32271",
  roleTitle: "QA Engineer",
  company: "Acme",
  context: "Manual + automation QA",
  weights: { test_automation: 25, tools: 10, programming: 10 },
  scoreFloor: 20,
  fitThresholds: { strong: 75, good: 60, moderate: 45, weak: 30 },
  idealCandidateProfile: {
    must_haves: ["Selenium"],
    nice_to_haves: ["API testing"],
    benchmarks: [],
  },
  approvedBy: "ca7c5c9c-fd1f-4261-87f5-40363fb96afd",
  approvedAt: "2026-05-20T13:18:20.819Z",
  version: 1,
};

describe("buildHybridJdBaseRubricSnapshot", () => {
  it("freezes JD Base fields used for scoring", () => {
    const snapshot = buildHybridJdBaseRubricSnapshot(sampleJdBase, {
      capturedAt: "2026-05-20T13:19:56.500Z",
    });

    expect(snapshot.schema_version).toBe(HYBRID_JD_BASE_RUBRIC_SNAPSHOT_SCHEMA_VERSION);
    expect(snapshot.lineage_status).toBe(HYBRID_JD_BASE_LINEAGE_CAPTURED);
    expect(snapshot.jd_base_document_id).toBe(sampleJdBase.id);
    expect(snapshot.jd_base_version).toBe(1);
    expect(snapshot.weights).toEqual(sampleJdBase.weights);
    expect(snapshot.ideal_candidate_profile?.must_haves).toEqual(["Selenium"]);
    expect(snapshot.captured_at).toBe("2026-05-20T13:19:56.500Z");
    expect(snapshot.backfill).toBeUndefined();
  });

  it("marks migration backfill snapshots", () => {
    const snapshot = buildHybridJdBaseRubricSnapshot(sampleJdBase, { backfill: true });
    expect(snapshot.backfill).toBe(true);
    expect(snapshot.lineage_status).toBe(HYBRID_JD_BASE_LINEAGE_BACKFILL_ACCURATE);
  });
});

describe("isFitScoreJdBaseStale", () => {
  it("detects stale scores after re-approval bumps version", () => {
    expect(isFitScoreJdBaseStale(1, 2, true)).toBe(true);
    expect(isFitScoreJdBaseStale(2, 2, true)).toBe(false);
  });

  it("flags linked scores with null version as unknown/stale", () => {
    expect(isFitScoreJdBaseStale(null, 2, true)).toBe(true);
  });

  it("does not flag legacy scores without JD Base linkage", () => {
    expect(isFitScoreJdBaseStale(null, 2, false)).toBe(false);
    expect(isFitScoreJdBaseStale(null, 2)).toBe(false);
  });
});
