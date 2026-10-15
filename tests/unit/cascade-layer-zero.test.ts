import { describe, it, expect } from "vitest";
import { evaluateLayerZero } from "@/lib/fitscore/cascade/layer-zero";

describe("Layer 0 — deterministic gatekeeper", () => {
  describe("experience floor", () => {
    it("knocks out candidate below required min years", () => {
      const r = evaluateLayerZero({ totalYearsExp: 2 }, { minYearsExp: 5 });
      expect(r.layer).toBe("LAYER_0_KNOCKOUT");
      expect(r.status).toBe("rejected");
      expect(r.reason).toContain("Experience gap");
    });

    it("does not knock out candidate above min", () => {
      const r = evaluateLayerZero({ totalYearsExp: 7 }, { minYearsExp: 5 });
      expect(r.layer).toBe("AMBIGUOUS");
    });

    it("does not knock out when parser was uncertain (null exp)", () => {
      const r = evaluateLayerZero({ totalYearsExp: null }, { minYearsExp: 5 });
      expect(r.layer).toBe("AMBIGUOUS");
    });

    it("ignores rule if JD didn't declare a floor", () => {
      const r = evaluateLayerZero({ totalYearsExp: 0 }, {});
      expect(r.layer).toBe("AMBIGUOUS");
    });
  });

  describe("location must-be-local", () => {
    it("knocks out when locations mismatch and mustBeLocal=true", () => {
      const r = evaluateLayerZero(
        { currentLocation: "Bangalore" },
        { location: "Mumbai", mustBeLocal: true },
      );
      expect(r.layer).toBe("LAYER_0_KNOCKOUT");
      expect(r.reason).toContain("Location mismatch");
    });

    it("matches case-insensitively and whitespace-tolerantly", () => {
      const r = evaluateLayerZero(
        { currentLocation: "  bangalore  " },
        { location: "BANGALORE", mustBeLocal: true },
      );
      expect(r.layer).toBe("AMBIGUOUS");
    });

    it("ignores rule when mustBeLocal is not set", () => {
      const r = evaluateLayerZero(
        { currentLocation: "Bangalore" },
        { location: "Mumbai", mustBeLocal: false },
      );
      expect(r.layer).toBe("AMBIGUOUS");
    });
  });

  describe("required degree", () => {
    it("knocks out when no required degree present", () => {
      const r = evaluateLayerZero({ degrees: ["BCOM"] }, { requiredDegrees: ["BTECH", "MTECH"] });
      expect(r.layer).toBe("LAYER_0_KNOCKOUT");
      expect(r.reason).toContain("Education mismatch");
    });

    it("passes when any required degree present (case-insensitive)", () => {
      const r = evaluateLayerZero({ degrees: ["btech"] }, { requiredDegrees: ["BTECH"] });
      expect(r.layer).toBe("AMBIGUOUS");
    });

    it("falls through when parser returned no degrees", () => {
      const r = evaluateLayerZero({ degrees: [] }, { requiredDegrees: ["BTECH"] });
      expect(r.layer).toBe("AMBIGUOUS");
    });
  });

  it("returns AMBIGUOUS when nothing trips", () => {
    const r = evaluateLayerZero(
      { totalYearsExp: 6, currentLocation: "Mumbai", degrees: ["BTECH"] },
      { minYearsExp: 5, location: "Mumbai", mustBeLocal: true, requiredDegrees: ["BTECH"] },
    );
    expect(r.layer).toBe("AMBIGUOUS");
    expect(r.status).toBe("continue");
  });
});
