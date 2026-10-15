import { describe, it, expect } from "vitest";
import { hiringManagerWork, agencyView, type SeatApp } from "@/lib/v2/seat-work";

/**
 * The two half-built seats.
 *
 * A hiring manager gets ~20 minutes a week, so their screen must be only what
 * they owe and what is coming — never a queue, never setup. An agency must see
 * enough truth to stop emailing the recruiter ("any update?"), and nothing
 * about other agencies, internal notes, or how their candidate compares.
 */
function app(over: Partial<SeatApp> = {}): SeatApp {
  return {
    id: "a1",
    candidateId: "c1",
    candidateName: "Rahul S.",
    jobId: "job-1",
    jobTitle: "Backend Engineer",
    status: "shortlisted",
    score: 80,
    createdAt: "2026-07-01T00:00:00Z",
    source: null,
    rejectionReason: null,
    ...over,
  };
}

describe("hiringManagerWork", () => {
  it("surfaces shortlisted candidates as decisions owed", () => {
    const w = hiringManagerWork([app({ status: "shortlisted" })]);
    expect(w.awaitingDecision).toHaveLength(1);
    expect(w.totalOwed).toBe(1);
  });

  it("ignores applications still in triage — that is the recruiter's work", () => {
    const w = hiringManagerWork([app({ status: "applied" }), app({ status: "viewed" })]);
    expect(w.awaitingDecision).toHaveLength(0);
    expect(w.totalOwed).toBe(0);
  });

  it("ignores anything already decided", () => {
    const w = hiringManagerWork([
      app({ status: "hired" }),
      app({ status: "rejected" }),
      app({ status: "withdrawn" }),
    ]);
    expect(w.totalOwed).toBe(0);
  });

  it("puts the longest-waiting candidate first — they are the flight risk", () => {
    const w = hiringManagerWork([
      app({ id: "new", createdAt: "2026-07-20T00:00:00Z" }),
      app({ id: "old", createdAt: "2026-07-01T00:00:00Z" }),
    ]);
    expect(w.awaitingDecision[0].id).toBe("old");
  });

  it("groups the work by job so a manager sees their roles, not a flat list", () => {
    const w = hiringManagerWork([
      app({ jobId: "a", jobTitle: "Backend" }),
      app({ jobId: "a", jobTitle: "Backend" }),
      app({ jobId: "b", jobTitle: "QA" }),
    ]);
    expect(w.byJob).toHaveLength(2);
    expect(w.byJob[0].count).toBe(2);
  });

  it("counts how long each has been waiting, since that is the pressure", () => {
    const now = Date.parse("2026-07-11T00:00:00Z");
    const w = hiringManagerWork([app({ createdAt: "2026-07-01T00:00:00Z" })], now);
    expect(w.awaitingDecision[0].waitingDays).toBe(10);
  });

  it("is safe with no data", () => {
    const w = hiringManagerWork([]);
    expect(w.totalOwed).toBe(0);
    expect(w.byJob).toEqual([]);
  });
});

describe("agencyView", () => {
  it("shows only this agency's own submissions", () => {
    const rows = agencyView(
      [app({ id: "mine", source: "agency:tb" }), app({ id: "theirs", source: "agency:other" })],
      "agency:tb",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("mine");
  });

  it("never leaks another agency's candidate, even with no source on ours", () => {
    const rows = agencyView([app({ source: null })], "agency:tb");
    expect(rows).toHaveLength(0);
  });

  it("reports stage honestly so nobody has to email for an update", () => {
    const rows = agencyView([app({ status: "shortlisted", source: "agency:tb" })], "agency:tb");
    expect(rows[0].stage).toBe("Shortlisted");
  });

  it("surfaces the held state, which is invisible today and causes the emails", () => {
    const rows = agencyView(
      [app({ status: "applied", score: null, source: "agency:tb" })],
      "agency:tb",
    );
    expect(rows[0].stage).toBe("Awaiting screening answers");
  });

  it("gives a reject reason category but never the internal detail", () => {
    const rows = agencyView(
      [app({ status: "rejected", rejectionReason: "compensation", source: "agency:tb" })],
      "agency:tb",
    );
    expect(rows[0].stage).toBe("Not selected");
    expect(rows[0].closedReason).toBe("compensation");
  });

  it("never exposes the score — that is an internal comparison", () => {
    const rows = agencyView([app({ score: 91, source: "agency:tb" })], "agency:tb");
    expect(Object.keys(rows[0])).not.toContain("score");
  });

  it("is safe with no submissions", () => {
    expect(agencyView([], "agency:tb")).toEqual([]);
  });
});
