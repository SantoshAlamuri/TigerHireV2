import { describe, it, expect } from "vitest";
import {
  SELF_SERVE_CANDIDATE_WINDOW_DAYS,
  getSelfServeCandidateLastBookableDay,
  isSlotEligibleForCandidateSelfServe,
  isSlotStartInPast,
} from "@/lib/interviews/self-serve-slot-window";

describe("self-serve-slot-window", () => {
  const tz = "Asia/Kolkata";

  it("allows today and the next two calendar days in IST", () => {
    const now = new Date("2026-05-18T06:00:00.000Z"); // 11:30 IST same day
    expect(isSlotEligibleForCandidateSelfServe("2026-05-18T10:00:00.000Z", now, tz)).toBe(true);
    expect(isSlotEligibleForCandidateSelfServe("2026-05-19T10:00:00.000Z", now, tz)).toBe(true);
    expect(isSlotEligibleForCandidateSelfServe("2026-05-20T10:00:00.000Z", now, tz)).toBe(true);
    expect(isSlotEligibleForCandidateSelfServe("2026-05-21T10:00:00.000Z", now, tz)).toBe(false);
  });

  it("rejects slots that already started", () => {
    const now = new Date("2026-05-18T12:00:00.000Z");
    expect(isSlotEligibleForCandidateSelfServe("2026-05-18T10:00:00.000Z", now, tz)).toBe(false);
  });

  it("last bookable day is today + window - 1", () => {
    const now = new Date("2026-05-18T12:00:00.000Z");
    const last = getSelfServeCandidateLastBookableDay(now, tz);
    expect(last).toEqual({ y: 2026, m: 5, d: 18 + SELF_SERVE_CANDIDATE_WINDOW_DAYS - 1 });
  });

  it("detects past slot starts", () => {
    const now = new Date("2026-05-18T12:00:00.000Z");
    expect(isSlotStartInPast("2026-05-17T12:00:00.000Z", now)).toBe(true);
    expect(isSlotStartInPast("2026-05-19T12:00:00.000Z", now)).toBe(false);
  });
});
