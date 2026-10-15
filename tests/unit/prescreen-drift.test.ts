import { describe, expect, it } from "vitest";
import { classifyPostShortlistDrift, type DriftSessionFields } from "@/lib/prescreen/drift";

// Defaults: reminder 24h, timeout 48h, sweep buffer 6h, grace 3h.
// So reminder drift starts past 27h; close drift starts past 57h.
const NOW = Date.parse("2026-07-10T12:00:00Z");

function hoursAgo(h: number): string {
  return new Date(NOW - h * 3_600_000).toISOString();
}

function session(overrides: Partial<DriftSessionFields>): DriftSessionFields {
  return {
    state: "awaiting_reply",
    questions_sent_at: null,
    reminder_sent_at: null,
    created_at: hoursAgo(1),
    ...overrides,
  };
}

describe("classifyPostShortlistDrift", () => {
  it("never flags a completed session — closed (incl. timed out) is the machine working", () => {
    expect(
      classifyPostShortlistDrift(
        session({ state: "complete", questions_sent_at: hoursAgo(100) }),
        NOW,
      ),
    ).toBeNull();
  });

  it("is quiet for an open session within all deadlines", () => {
    expect(
      classifyPostShortlistDrift(session({ questions_sent_at: hoursAgo(10) }), NOW),
    ).toBeNull();
  });

  it("is quiet just inside the reminder grace window", () => {
    expect(
      classifyPostShortlistDrift(session({ questions_sent_at: hoursAgo(26) }), NOW),
    ).toBeNull();
  });

  it("flags reminder_overdue when questions went out >27h ago and no reminder was sent", () => {
    expect(classifyPostShortlistDrift(session({ questions_sent_at: hoursAgo(28) }), NOW)).toBe(
      "reminder_overdue",
    );
  });

  it("stays quiet after the reminder actually went out (until the close deadline)", () => {
    expect(
      classifyPostShortlistDrift(
        session({ questions_sent_at: hoursAgo(30), reminder_sent_at: hoursAgo(5) }),
        NOW,
      ),
    ).toBeNull();
  });

  it("flags close_overdue past timeout + sweep buffer + grace, even when reminded", () => {
    expect(
      classifyPostShortlistDrift(
        session({ questions_sent_at: hoursAgo(58), reminder_sent_at: hoursAgo(33) }),
        NOW,
      ),
    ).toBe("close_overdue");
  });

  it("close_overdue outranks reminder_overdue for very stale unreminded sessions", () => {
    expect(classifyPostShortlistDrift(session({ questions_sent_at: hoursAgo(72) }), NOW)).toBe(
      "close_overdue",
    );
  });

  it("consent-stage sessions (no questions sent) have no reminder deadline, only close", () => {
    expect(
      classifyPostShortlistDrift(
        session({ state: "awaiting_consent", created_at: hoursAgo(30) }),
        NOW,
      ),
    ).toBeNull();
    expect(
      classifyPostShortlistDrift(
        session({ state: "awaiting_consent", created_at: hoursAgo(58) }),
        NOW,
      ),
    ).toBe("close_overdue");
  });

  it("returns null on unparseable timestamps instead of guessing", () => {
    expect(
      classifyPostShortlistDrift(session({ created_at: null, questions_sent_at: null }), NOW),
    ).toBeNull();
    expect(classifyPostShortlistDrift(session({ created_at: "not-a-date" }), NOW)).toBeNull();
  });
});
