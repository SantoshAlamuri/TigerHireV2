import { describe, it, expect } from "vitest";

/**
 * P1 smoke: key launch routes/modules import without throwing (build sanity).
 */
describe("launch P1 route modules", () => {
  it("imports self-schedule API and communications route factories", async () => {
    const { GET: getSched } = await import("@/app/api/schedule/self-serve/[token]/route");
    const { POST: postBook } = await import("@/app/api/schedule/self-serve/[token]/book/route");
    const { GET: getComm } = await import("@/app/api/applications/[id]/communications/route");
    expect(getSched).toBeDefined();
    expect(postBook).toBeDefined();
    expect(getComm).toBeDefined();
  });

  it("validates wa template param builder", async () => {
    const { buildTemplateBodyParams } = await import("@/lib/whatsapp/wa-template-registry");
    const params = {
      candidate_first_name: "Sam",
      job_title: "Engineer",
      company_name: "Acme",
    };
    expect(() => buildTemplateBodyParams("application_received", params)).not.toThrow();
  });
});
