import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: vi.fn(),
}));

import { isEnabled } from "@/lib/feature-flags";
import {
  isPathUnificationEnabled,
  isHaikuExtractionEnabled,
  CASCADE_FLAG_KEYS,
} from "@/lib/feature-flags/cascade";
import { resolveUseMergedExtractionPath } from "@/lib/fitscore/resolve-scoring-models";

describe("cascade feature flags", () => {
  beforeEach(() => {
    vi.mocked(isEnabled).mockReset();
  });

  it("uses typed flag keys", () => {
    expect(CASCADE_FLAG_KEYS.pathUnification).toBe("ff_path_unification");
    expect(CASCADE_FLAG_KEYS.haikuExtraction).toBe("ff_haiku_extraction");
  });

  it("path unification enables merged path", async () => {
    vi.mocked(isEnabled).mockImplementation(async (key) => key === "ff_path_unification");
    await expect(isPathUnificationEnabled("org-1")).resolves.toBe(true);
    await expect(
      resolveUseMergedExtractionPath({ organisationId: "org-1", scoringSource: "upload" }),
    ).resolves.toBe(true);
  });

  it("haiku flag is independent of path unification", async () => {
    vi.mocked(isEnabled).mockImplementation(async (key) => key === "ff_haiku_extraction");
    await expect(isHaikuExtractionEnabled()).resolves.toBe(true);
    await expect(isPathUnificationEnabled()).resolves.toBe(false);
  });
});
