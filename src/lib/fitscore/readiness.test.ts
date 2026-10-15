import { describe, expect, it } from "vitest";
import { computeReadiness } from "./readiness";

const base = {
  noticePeriodDays: null,
  availableFrom: null,
  relocationWillingness: null,
  offersInHand: null,
  hasCv: false,
  screeningCompleted: false,
};

describe("computeReadiness", () => {
  it("refuses to fabricate a score without any real logistics signal", () => {
    // CV/screening are always-known process states; alone they must not produce a number.
    const r = computeReadiness({ ...base, hasCv: true, screeningCompleted: true });
    expect(r.score).toBeNull();
    expect(r.band).toBe("Unknown");
  });

  it("scores once at least one core logistics signal is known", () => {
    const r = computeReadiness({ ...base, noticePeriodDays: 30 });
    expect(r.score).not.toBeNull();
    expect(r.band).not.toBe("Unknown");
  });

  it("short notice scores higher than long notice", () => {
    const short = computeReadiness({ ...base, noticePeriodDays: 15 });
    const long = computeReadiness({ ...base, noticePeriodDays: 90 });
    expect(short.score!).toBeGreaterThan(long.score!);
  });

  it("weights notice above weaker signals", () => {
    // Same inputs except notice flips 15d → 90d; the swing should be large because
    // notice carries the highest weight.
    const good = computeReadiness({ ...base, noticePeriodDays: 15, hasCv: true });
    const bad = computeReadiness({ ...base, noticePeriodDays: 90, hasCv: true });
    expect(good.score! - bad.score!).toBeGreaterThanOrEqual(40);
  });

  it("competing offers reduce readiness (counteroffer risk), 0 offers is neutral", () => {
    const none = computeReadiness({ ...base, offersInHand: 0 });
    const three = computeReadiness({ ...base, offersInHand: 3 });
    expect(none.score!).toBeGreaterThan(three.score!);
    // Neutral, not a boost: a candidate with only "0 offers" known is not "Ready now".
    expect(none.band).not.toBe("Ready now");
  });

  it("a genuinely ready candidate lands in Ready now", () => {
    const r = computeReadiness({
      noticePeriodDays: 10,
      availableFrom: null,
      relocationWillingness: "yes",
      offersInHand: 0,
      hasCv: true,
      screeningCompleted: true,
    });
    expect(r.band).toBe("Ready now");
  });

  it("a long-notice, no-relocation candidate lands in Long lead", () => {
    const r = computeReadiness({ ...base, noticePeriodDays: 90, relocationWillingness: "no" });
    expect(r.band).toBe("Long lead");
  });

  it("reports coverage honestly", () => {
    const r = computeReadiness({ ...base, noticePeriodDays: 30 });
    // notice + cv + screening are known; availability/relocation/offers are not.
    expect(r.knownSignals).toBe(3);
    expect(r.totalSignals).toBe(6);
  });

  it("invalid availableFrom date is treated as unknown", () => {
    const r = computeReadiness({ ...base, availableFrom: "not-a-date" });
    expect(r.parts.find((p) => p.key === "availability")?.value).toBeNull();
    expect(r.score).toBeNull(); // still no core signal
  });
});
