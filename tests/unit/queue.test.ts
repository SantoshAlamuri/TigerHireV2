import { describe, it, expect } from "vitest";
import { enqueue } from "@/lib/jobs/queue";

/**
 * Queue is a no-op abstraction until wired to Inngest/Trigger.dev.
 * Tests assert the current API: enqueue(name, payload) returns a resolved promise.
 */
describe("enqueue", () => {
  it("resolves without throwing", async () => {
    const result = await enqueue("fit-score-batch", { jobId: "j-1" });
    expect(result).toEqual({});
  });

  it("accepts fit-score-single payload", async () => {
    const result = await enqueue("fit-score-single", {
      candidateId: "c-1",
      jobId: "j-1",
    });
    expect(result).toEqual({});
  });

  it("accepts pipeline-reminder payload", async () => {
    const result = await enqueue("pipeline-reminder", { applicationId: "a-1" });
    expect(result).toEqual({});
  });

  it("accepts webhook-process payload", async () => {
    await expect(enqueue("webhook-process", { source: "test" })).resolves.toEqual({});
  });

  it("accepts pipeline-reminder payload", async () => {
    await expect(enqueue("pipeline-reminder", { candidateId: "c-1" })).resolves.toEqual({});
  });

  it("accepts offer-bgv-trigger payload", async () => {
    await expect(
      enqueue("offer-bgv-trigger", {
        offerId: "o-1",
        organisationId: "org-1",
        candidateId: "c-1",
        applicationId: "a-1",
      }),
    ).resolves.toEqual({});
  });
});
