import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();
const mockCacheDel = vi.fn();

vi.mock("@/lib/redis/cache", () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
  cacheDel: (...args: unknown[]) => mockCacheDel(...args),
}));

import {
  getCachedFitScore,
  setCachedFitScore,
  invalidateFitScoreCache,
} from "@/lib/redis/fitscore-cache";

describe("fitscore-cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCachedFitScore", () => {
    it("calls cacheGet with composite key", async () => {
      const data = { score: 87, breakdown: {} };
      mockCacheGet.mockResolvedValue(data);

      const result = await getCachedFitScore("c-1", "j-1");

      expect(mockCacheGet).toHaveBeenCalledWith("fitscore:c-1:j-1");
      expect(result).toEqual(data);
    });

    it("returns null on cache miss", async () => {
      mockCacheGet.mockResolvedValue(null);

      const result = await getCachedFitScore("c-2", "j-2");

      expect(result).toBeNull();
    });
  });

  describe("setCachedFitScore", () => {
    it("calls cacheSet with composite key and 1800s TTL", async () => {
      const data = { score: 92, breakdown: { skills: 95 } };
      mockCacheSet.mockResolvedValue(undefined);

      await setCachedFitScore("c-1", "j-1", data);

      expect(mockCacheSet).toHaveBeenCalledWith("fitscore:c-1:j-1", data, 1800);
    });
  });

  describe("invalidateFitScoreCache", () => {
    it("deletes the composite key", async () => {
      mockCacheDel.mockResolvedValue(undefined);

      await invalidateFitScoreCache("c-1", "j-1");

      expect(mockCacheDel).toHaveBeenCalledWith("fitscore:c-1:j-1");
      expect(mockCacheDel).toHaveBeenCalledTimes(1);
    });
  });
});
