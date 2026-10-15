import { describe, it, expect } from "vitest";
import { selectBoundaryPool } from "@/lib/fitscore/cascade/boundary";

describe("selectBoundaryPool", () => {
  it("returns all when pool smaller than limit", () => {
    const pool = selectBoundaryPool([
      { candidateId: "a", fitScore: 90 },
      { candidateId: "b", fitScore: 80 },
    ]);
    expect(pool).toHaveLength(2);
  });

  it("caps at boundary pool size", () => {
    const ranked = Array.from({ length: 20 }, (_, i) => ({
      candidateId: `c-${i}`,
      fitScore: 100 - i,
    }));
    const pool = selectBoundaryPool(ranked);
    expect(pool.length).toBeLessThanOrEqual(15);
  });
});
