import { describe, it, expect } from "vitest";
import {
  scoreToTone,
  scoreToneColorVar,
  scoreToneTextClass,
  scoreToneBgClass,
  scoreToneClasses,
} from "@/lib/score-tone";

describe("scoreToTone", () => {
  it("buckets on the canonical 80/60/40 thresholds", () => {
    expect(scoreToTone(100)).toBe("strong");
    expect(scoreToTone(80)).toBe("strong");
    expect(scoreToTone(79)).toBe("good");
    expect(scoreToTone(60)).toBe("good");
    expect(scoreToTone(59)).toBe("fair");
    expect(scoreToTone(40)).toBe("fair");
    expect(scoreToTone(39)).toBe("weak");
    expect(scoreToTone(0)).toBe("weak");
  });

  it("clamps out-of-range scores", () => {
    expect(scoreToTone(150)).toBe("strong");
    expect(scoreToTone(-10)).toBe("weak");
  });
});

describe("score-tone class/var helpers", () => {
  it("returns token-based CSS values, never raw Tailwind palette names", () => {
    expect(scoreToneColorVar(82)).toBe("var(--score-strong)");
    expect(scoreToneTextClass(82)).toBe("text-[color:var(--score-strong)]");
    expect(scoreToneBgClass(82)).toBe("bg-[color:var(--score-strong-bg)]");
    expect(scoreToneClasses(82)).toEqual({
      text: "text-[color:var(--score-strong)]",
      bg: "bg-[color:var(--score-strong-bg)]",
    });
  });
});
