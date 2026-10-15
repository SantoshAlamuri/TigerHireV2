import { describe, it, expect } from "vitest";
import { authProfileKey, featureFlagKey, myPipelineKey, orgEntitlementKey } from "@/lib/redis/keys";
import { keyBuilderPerfLimits } from "../helpers/ci-perf";

describe("Performance — Redis cache key builders", () => {
  it("derives 50k keys within budget (hot-path regression)", () => {
    const n = 50_000;
    const start = performance.now();
    for (let i = 0; i < n; i++) {
      const id = `user-${i}`;
      authProfileKey(id);
      myPipelineKey(id);
      featureFlagKey(`flag-${i % 40}`);
      orgEntitlementKey(`org-${i % 200}`);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(keyBuilderPerfLimits.fiftyKKeyBuildsMs);
  });
});
