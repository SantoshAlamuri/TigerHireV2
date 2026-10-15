import { describe, it, expect } from "vitest";
import { screeningReach } from "@/lib/v2/screening-reach";

/**
 * Candidate reply rate — the last tile that could not light up.
 *
 * It needs a denominator: how many candidates were actually messaged.
 * prescreen_sessions.questions_sent_at is that, and nothing exposed it, so the
 * tile was fed a hardcoded zero and read "No screening messages sent yet"
 * forever.
 *
 * The rate must divide by SENT, not by sessions created. A session that exists
 * but was never sent (the send failed, or the candidate had no phone number) is
 * not a candidate who ignored us, and counting it as one understates reply rate
 * while hiding a delivery problem.
 */
const s = (over = {}) => ({
  questions_sent_at: "2026-07-01T00:00:00Z" as string | null,
  completed_at: null as string | null,
  declined_at: null as string | null,
  ...over,
});

describe("screeningReach", () => {
  it("divides replies by messages actually sent", () => {
    const r = screeningReach([
      s({ completed_at: "2026-07-02T00:00:00Z" }),
      s({ completed_at: "2026-07-02T00:00:00Z" }),
      s(),
      s(),
    ]);
    expect(r.sent).toBe(4);
    expect(r.replied).toBe(2);
    expect(r.replyRate).toBe(50);
  });

  it("excludes sessions that were never sent from the denominator", () => {
    // A failed send is a delivery problem, not a candidate ignoring us.
    const r = screeningReach([
      s({ completed_at: "2026-07-02T00:00:00Z" }),
      s({ questions_sent_at: null }),
      s({ questions_sent_at: null }),
    ]);
    expect(r.sent).toBe(1);
    expect(r.replyRate).toBe(100);
    expect(r.neverSent).toBe(2);
  });

  it("counts an explicit decline as a reply, because the candidate did respond", () => {
    const r = screeningReach([s({ declined_at: "2026-07-02T00:00:00Z" })]);
    expect(r.replied).toBe(1);
    expect(r.declined).toBe(1);
  });

  it("returns null rather than zero when nothing has been sent", () => {
    expect(screeningReach([]).replyRate).toBeNull();
    expect(screeningReach([s({ questions_sent_at: null })]).replyRate).toBeNull();
  });

  it("never exceeds 100%", () => {
    const r = screeningReach([s({ completed_at: "x", declined_at: "y" })]);
    expect(r.replyRate).toBe(100);
  });
});
