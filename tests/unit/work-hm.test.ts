import { describe, expect, it } from "vitest";
import { canDecide, cardsFromApprovals } from "@/lib/work/hm";
import type { ApprovalTaskItem } from "@/lib/approvals/task-types";

const shortlist = {
  id: "shortlist:a1",
  source: "candidate_shortlist",
  createdAt: "2026-10-10T00:00:00Z",
  payload: {
    id: "a1",
    job_id: "j1",
    candidate_id: "c1",
    status: "pending",
    created_at: "2026-10-10T00:00:00Z",
    candidates: { id: "c1", name: "Asha", email: null, skills: ["Go", "SQL"], location: "Pune" },
    jobTitle: "Backend lead",
    fitScore: 81.6,
    fitBand: "Strong",
    approvals: [],
    commentPreview: null,
  },
} as ApprovalTaskItem;

const request = {
  id: "requisition:s1",
  source: "hiring_request",
  createdAt: "2026-10-01T00:00:00Z",
  payload: {
    id: "s1",
    requestId: "r1",
    requestTitle: "Data analyst",
    reqCode: "REQ-7",
    department: "Finance",
    urgency: null,
    status: "pending",
    headcount: 2,
    budgetCtcMin: 1_200_000,
    budgetCtcMax: 1_800_000,
    stageKey: "hm",
    approverRole: "hiring_manager",
    slaDueAt: null,
    createdAt: "2026-10-01T00:00:00Z",
    createdById: null,
    commentPreview: "Backfill",
  },
} as ApprovalTaskItem;

describe("hm decisions", () => {
  it("puts candidates first and maps the decision body", () => {
    const cards = cardsFromApprovals([request, shortlist]);
    expect(cards.map((c) => c.kind)).toEqual(["candidate", "request"]);
    expect(cards[0].body).toEqual({ jobId: "j1", candidateId: "c1" });
    expect(cards[0].facts[0]).toEqual(["Score", "82, Strong"]);
    expect(cards[1].body).toEqual({ requestId: "r1" });
    expect(cards[1].facts).toContainEqual(["Budget", "12 LPA to 18 LPA"]);
  });

  it("leaves offers out", () => {
    const offer = {
      id: "offer_finance:o1",
      source: "offer_finance",
      createdAt: "2026-10-01T00:00:00Z",
      payload: {},
    } as unknown as ApprovalTaskItem;
    expect(cardsFromApprovals([offer])).toEqual([]);
  });

  it("needs a reason to say no", () => {
    expect(canDecide("approved", "")).toBe(true);
    expect(canDecide("rejected", " ")).toBe(false);
    expect(canDecide("rejected", "Too junior")).toBe(true);
  });
});
