import { describe, it, expect } from "vitest";
import {
  generateEntityHash,
  generatePairHash,
  normalizeForHash,
} from "@/lib/fitscore/cascade/entity-hash";

describe("entity-hash normalization", () => {
  it("strips whitespace, punctuation, casing for stable hashing", () => {
    expect(normalizeForHash("Hello, World!")).toBe("helloworld");
    expect(normalizeForHash("  HELLO   world  ")).toBe("helloworld");
    expect(normalizeForHash("hello-world")).toBe("helloworld");
  });

  it("produces identical hashes for cosmetically-different but semantically-same text", () => {
    const a = generateEntityHash("Senior Software Engineer, Bangalore");
    const b = generateEntityHash("senior software engineer bangalore");
    const c = generateEntityHash("SENIOR-SOFTWARE-ENGINEER\nBANGALORE");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("produces different hashes for semantically-different text", () => {
    const a = generateEntityHash("Senior Software Engineer");
    const b = generateEntityHash("Junior Software Engineer");
    expect(a).not.toBe(b);
  });

  it("pair hash is stable for the same (candidate, jd) pair", () => {
    const h1 = generatePairHash("candidate text", "jd text");
    const h2 = generatePairHash("CANDIDATE  text!!", "JD-TEXT");
    expect(h1).toBe(h2);
  });

  it("pair hash differs when args are swapped (order matters)", () => {
    const h1 = generatePairHash("a", "b");
    const h2 = generatePairHash("b", "a");
    expect(h1).not.toBe(h2);
  });
});
