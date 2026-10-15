import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: vi.fn(),
}));

vi.mock("@/lib/fitscore/hybrid/constants", () => ({
  isMergedExtractionVerdictEnabled: vi.fn(() => false),
}));

import { isEnabled } from "@/lib/feature-flags";
import { resolveUseMergedExtractionPath } from "@/lib/fitscore/resolve-scoring-models";

describe("resolveUseMergedExtractionPath", () => {
  beforeEach(() => {
    vi.mocked(isEnabled).mockReset();
  });

  it("forces merged path when ff_path_unification is on", async () => {
    vi.mocked(isEnabled).mockImplementation(async (key) => key === "ff_path_unification");
    await expect(
      resolveUseMergedExtractionPath({ organisationId: "org-1", scoringSource: "upload" }),
    ).resolves.toBe(true);
  });

  it("does not use merged path when both flags off and not tryout", async () => {
    vi.mocked(isEnabled).mockResolvedValue(false);
    await expect(
      resolveUseMergedExtractionPath({ organisationId: "org-1", scoringSource: "upload" }),
    ).resolves.toBe(false);
  });
});
