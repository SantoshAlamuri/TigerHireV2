import { describe, it, expect } from "vitest";
import {
  calendarEventHref,
  jobSchedulingHref,
  CALENDAR_EVENT_ACTION_LABEL,
} from "@/lib/calendar/scheduling-hrefs";

describe("scheduling-hrefs", () => {
  it("routes interviews to job scheduling tab", () => {
    expect(jobSchedulingHref("job-1")).toBe("/recruit/jobs/job-1/interviews");
    expect(calendarEventHref("interview", "job-1")).toBe("/recruit/jobs/job-1/interviews");
  });

  it("routes assessments and offers to sensible job tabs", () => {
    expect(calendarEventHref("assessment_deadline", "job-2")).toBe(
      "/recruit/jobs/job-2/assessments",
    );
    expect(calendarEventHref("offer_expiry", "job-2")).toBe("/recruit/jobs/job-2");
  });

  it("exposes action labels for agenda rows", () => {
    expect(CALENDAR_EVENT_ACTION_LABEL.interview).toMatch(/scheduling/i);
  });
});
