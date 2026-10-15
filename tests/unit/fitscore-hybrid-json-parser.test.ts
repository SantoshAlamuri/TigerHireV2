import { describe, it, expect } from "vitest";
import { parseHybridExtractionJson } from "@/lib/fitscore/hybrid/json-parser";

describe("parseHybridExtractionJson", () => {
  it("parses JSON wrapped in markdown fences", () => {
    const raw = '```json\n{"candidate_name":"A","sm_years":3}\n```';
    const r = parseHybridExtractionJson(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.candidate_name).toBe("A");
  });

  it("handles smart quotes", () => {
    const raw = `{"candidate_name":\u201cPat\u201d,"sm_years":2}`;
    const r = parseHybridExtractionJson(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.candidate_name).toBe("Pat");
  });

  it("extracts object from surrounding noise", () => {
    const raw = `Here is JSON:\n{"x":1,"y":2}\nThanks`;
    const r = parseHybridExtractionJson(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.x).toBe(1);
  });
});
