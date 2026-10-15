import { describe, expect, it } from "vitest";
import {
  deriveGateStatus,
  rowPostShortlistBucket,
} from "@/app/(dashboard)/recruit/jobs/[id]/screening/page";

type Row = Parameters<typeof rowPostShortlistBucket>[0];
type QuestionGroups = Parameters<typeof deriveGateStatus>[1];

function row(over: Partial<Row>): Row {
  return {
    applicationId: "a1",
    candidateId: "c1",
    candidateName: "Test",
    applicationStatus: "shortlisted",
    pipelineStageName: "Shortlisted",
    gateStatus: null,
    prescreenSessionByStage: {},
    postShortlistAnswerCount: 0,
    postShortlistQuestionCount: 7,
    postShortlistFailed: false,
    fitScore: 70,
    fitBand: "Good Fit",
    scoringMethod: "hybrid_merged",
    answers: {},
    ...over,
  };
}

describe("rowPostShortlistBucket", () => {
  it("partitions shortlisted rows into mutually exclusive buckets", () => {
    const rows: Row[] = [
      row({ candidateId: "1" }),
      row({
        candidateId: "2",
        prescreenSessionByStage: { post_shortlist: "awaiting_consent" },
      }),
      row({
        candidateId: "3",
        prescreenSessionByStage: { post_shortlist: "awaiting_reply" },
        postShortlistAnswerCount: 2,
      }),
      row({ candidateId: "4", postShortlistAnswerCount: 7 }),
      row({
        candidateId: "5",
        postShortlistAnswerCount: 7,
        postShortlistFailed: true,
        gateStatus: "failed",
        fitBand: "Gated Out",
      }),
    ];
    const buckets = rows.map((r) => rowPostShortlistBucket(r));
    expect(buckets).toEqual(["not_started", "awaiting", "in_progress", "finished", "failed"]);
  });
});

describe("deriveGateStatus", () => {
  function question(id: string, phase: "web_apply" | "post_shortlist") {
    return { id, source: "canonical" as const, phase, text: id, sortOrder: 0 };
  }

  const groups: QuestionGroups = [
    { questions: [question("web-1", "web_apply"), question("web-2", "web_apply")] },
    { questions: [question("ps-1", "post_shortlist"), question("ps-2", "post_shortlist")] },
  ];

  const yes = { value: "Yes", passed: true };
  const no = { value: "No", passed: false };

  it("passes a candidate who finished every group they participated in, ignoring unseen groups", () => {
    // CV-uploaded candidate: answered all post-shortlist questions, never saw web-apply.
    const r = row({ answers: { "ps-1": yes, "ps-2": yes } });
    expect(deriveGateStatus(r, groups)).toBe("passed");
  });

  it("passes when every question of every participated group is yes", () => {
    const r = row({ answers: { "web-1": yes, "web-2": yes, "ps-1": yes, "ps-2": yes } });
    expect(deriveGateStatus(r, groups)).toBe("passed");
  });

  it("stays pending while a participated group is incomplete", () => {
    const r = row({ answers: { "ps-1": yes } });
    expect(deriveGateStatus(r, groups)).toBe("pending");

    const partialWeb = row({ answers: { "web-1": yes, "ps-1": yes, "ps-2": yes } });
    expect(deriveGateStatus(partialWeb, groups)).toBe("pending");
  });

  it("fails on any knockout no in any group", () => {
    const r = row({ answers: { "ps-1": yes, "ps-2": no } });
    expect(deriveGateStatus(r, groups)).toBe("failed");

    const webNo = row({ answers: { "web-1": no, "ps-1": yes, "ps-2": yes } });
    expect(deriveGateStatus(webNo, groups)).toBe("failed");
  });

  it("falls back to the stored gate when no visible question is answered", () => {
    expect(deriveGateStatus(row({ answers: {}, gateStatus: "pending" }), groups)).toBe("pending");
    expect(deriveGateStatus(row({ answers: {}, gateStatus: null }), groups)).toBeNull();
  });

  it("respects a stored failed gate regardless of answers", () => {
    const r = row({ gateStatus: "failed", answers: { "ps-1": yes, "ps-2": yes } });
    expect(deriveGateStatus(r, groups)).toBe("failed");
  });
});
