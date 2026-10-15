import { describe, it, expect } from "vitest";
import { serializationPerfLimits } from "../helpers/ci-perf";

describe("Performance — JSON serialization (API-shaped payloads)", () => {
  it("round-trips 2k compact records within budget", () => {
    const records = Array.from({ length: 2000 }, (_, i) => ({
      id: `row-${i}`,
      title: `Job title ${i % 400}`,
      orgId: `org-${i % 50}`,
      status: i % 3 === 0 ? "open" : i % 3 === 1 ? "closed" : "draft",
      updatedAt: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T12:00:00Z`,
    }));

    const start = performance.now();
    const text = JSON.stringify(records);
    const roundtrip = JSON.parse(text) as typeof records;
    const elapsed = performance.now() - start;

    expect(roundtrip).toHaveLength(2000);
    expect(roundtrip[1999]?.id).toBe("row-1999");
    expect(elapsed).toBeLessThan(serializationPerfLimits.batchRoundtripMs);
  });
});
