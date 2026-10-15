import { describe, it, expect, vi } from "vitest";

const mockServe = vi.fn(() => ({ GET: "get", POST: "post", PUT: "put" }));

vi.mock("inngest/next", () => ({
  serve: (...args: unknown[]) => mockServe(...args),
}));

vi.mock("@/inngest/client", () => ({
  inngest: { id: "test-client" },
}));

/** Mirrors exports registered in src/app/api/inngest/route.ts */
const REGISTERED_INNGEST_HANDLERS = [
  "agencyCandidateReprocess",
  "cvParseRetry",
  "fitScoreSingle",
  "fitScoreBatch",
  "jobDistribute",
  "jobRemoveFromBoards",
  "offerBgvTrigger",
  "resumeParse",
  "pipelineReminder",
  "webhookProcess",
  "whatsappInbound",
  "postHirePulseScheduler",
  "applicationDeadlineReminders",
  "screeningInactivity",
  "prescreenLifecycle",
  "headcountPlanSync",
  "referralCampaignSend",
  "referralCampaignScheduledLaunch",
  "referralCampaignCheckEnd",
  "referralCampaignAttribute",
  "referralCampaignStatusAttribute",
  "interviewSchedulingFollowups",
  "planExceptionDetection",
  "whatsappScreeningReconciler",
  "generateJdBase",
  "jdBaseApprovalReconcile",
  "listwiseRerank",
  "lazyVerdict",
  "requisitionGenerateJd",
] as const;

vi.mock("@/inngest/functions", () =>
  Object.fromEntries(REGISTERED_INNGEST_HANDLERS.map((name) => [name, { id: name }])),
);

describe("api inngest route registration", () => {
  it("registers all queue-backed handlers", async () => {
    await import("@/app/api/inngest/route");
    expect(mockServe).toHaveBeenCalledTimes(1);
    const arg = mockServe.mock.calls[0]?.[0] as { functions: Array<{ id: string }> };
    const ids = arg.functions.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining([...REGISTERED_INNGEST_HANDLERS]));
    expect(ids).toHaveLength(REGISTERED_INNGEST_HANDLERS.length);
  });
});
