import { describe, expect, it } from "vitest";
import { buildJourney, nextStop, pickCurrent, type JourneyFacts } from "@/lib/work/journey";

const base: JourneyFacts = {
  hiringRequestId: "hr1",
  hiringRequestStatus: "approved",
  jdPublished: true,
  rubricApproved: true,
  rubricNotRequired: false,
  mustHaveCount: 4,
  roleOpen: true,
  publicApplications: true,
  screeningQuestionCount: 2,
  applicants: 0,
  unscored: 0,
  awaitingReview: 0,
  shortlisted: 0,
  hired: 0,
  interviewsUpcoming: 0,
  interviewsAwaitingFeedback: 0,
  offersOut: 0,
  offersNeedingAction: 0,
  offersSigned: 0,
};
const status = (f: Partial<JourneyFacts>) =>
  Object.fromEntries(buildJourney({ ...base, ...f }).stages.map((s) => [s.key, s.status]));

describe("work journey", () => {
  it("lands a fresh job on the description when nothing is done", () => {
    const j = buildJourney({ ...base, jdPublished: false, rubricApproved: false, roleOpen: false });
    expect(j.currentKey).toBe("description");
    expect(status({ jdPublished: false, rubricApproved: false, roleOpen: false }).publish).toBe(
      "waiting",
    );
  });

  it("skips the request stage for jobs created without one", () => {
    expect(status({ hiringRequestId: null }).request).toBe("skipped");
  });

  it("asks for publish once description and rubric are done", () => {
    const j = buildJourney({ ...base, roleOpen: false });
    expect(j.currentKey).toBe("publish");
  });

  it("treats rubric as skipped when role scoring is off, and still lets the job publish", () => {
    const s = status({ rubricApproved: false, rubricNotRequired: true, roleOpen: false });
    expect(s.rubric).toBe("skipped");
    expect(s.publish).toBe("needs_you");
  });

  it("lets automation hold a live job with no applicants", () => {
    const j = buildJourney(base);
    expect(j.currentKey).toBe("applications");
    expect(j.stages.find((s) => s.key === "applications")?.status).toBe("working");
    expect(j.needsYouCount).toBe(0);
  });

  it("blocks scoring when applicants exist without an approved rubric", () => {
    const j = buildJourney({ ...base, rubricApproved: false, applicants: 12 });
    expect(j.stages.find((s) => s.key === "scoring")?.status).toBe("blocked");
    expect(j.currentKey).toBe("rubric");
  });

  it("sends the person to review when candidates await a decision, even while scoring runs", () => {
    const j = buildJourney({ ...base, applicants: 30, unscored: 4, awaitingReview: 9 });
    expect(status({ applicants: 30, unscored: 4, awaitingReview: 9 }).scoring).toBe("working");
    expect(j.currentKey).toBe("review");
  });

  it("asks to schedule shortlisted candidates, then hands booked interviews to automation", () => {
    expect(status({ applicants: 10, shortlisted: 3 }).interviews).toBe("needs_you");
    expect(status({ applicants: 10, shortlisted: 3, interviewsUpcoming: 3 }).interviews).toBe(
      "working",
    );
    expect(
      status({
        applicants: 10,
        shortlisted: 3,
        interviewsUpcoming: 1,
        interviewsAwaitingFeedback: 2,
      }).interviews,
    ).toBe("needs_you");
  });

  it("marks the journey complete when the offer is signed", () => {
    const j = buildJourney({
      ...base,
      applicants: 10,
      shortlisted: 1,
      offersOut: 1,
      offersSigned: 1,
      hired: 1,
    });
    expect(j.complete).toBe(true);
    expect(j.currentKey).toBe("offer");
  });

  it("finds the next stop after a stage", () => {
    const j = buildJourney({ ...base, roleOpen: false });
    expect(nextStop(j, "rubric")).toBe("publish");
    expect(nextStop(j, "offer")).toBeNull();
  });

  it("falls back to the last stage when nothing is pending", () => {
    expect(
      pickCurrent([
        { key: "offer", label: "Offer", actors: ["you"], status: "done", headline: "" },
      ]),
    ).toBe("offer");
  });
});
