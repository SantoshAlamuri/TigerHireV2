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
  getCachedPublicJobs,
  setCachedPublicJobs,
  getCachedPublicJob,
  setCachedPublicJob,
  invalidatePublicJobCache,
} from "@/lib/redis/public-cache";

describe("public-cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCachedPublicJobs", () => {
    it("calls cacheGet with the public jobs key", async () => {
      const data = [{ id: "j1", title: "Engineer" }];
      mockCacheGet.mockResolvedValue(data);

      const result = await getCachedPublicJobs();

      expect(mockCacheGet).toHaveBeenCalledWith("public:jobs:list");
      expect(result).toEqual(data);
    });

    it("returns null on cache miss", async () => {
      mockCacheGet.mockResolvedValue(null);

      const result = await getCachedPublicJobs();

      expect(result).toBeNull();
    });
  });

  describe("setCachedPublicJobs", () => {
    it("calls cacheSet with data and 120s TTL", async () => {
      const data = [{ id: "j1" }];
      mockCacheSet.mockResolvedValue(undefined);

      await setCachedPublicJobs(data);

      expect(mockCacheSet).toHaveBeenCalledWith("public:jobs:list", data, 120);
    });
  });

  describe("getCachedPublicJob", () => {
    it("calls cacheGet with slug-based key", async () => {
      const data = { id: "j1", slug: "senior-engineer" };
      mockCacheGet.mockResolvedValue(data);

      const result = await getCachedPublicJob("senior-engineer");

      expect(mockCacheGet).toHaveBeenCalledWith("public:jobs:detail:senior-engineer");
      expect(result).toEqual(data);
    });

    it("returns null on cache miss", async () => {
      mockCacheGet.mockResolvedValue(null);

      const result = await getCachedPublicJob("missing-slug");

      expect(result).toBeNull();
    });
  });

  describe("setCachedPublicJob", () => {
    it("calls cacheSet with slug-based key and 120s TTL", async () => {
      const data = { id: "j1", slug: "senior-engineer" };
      mockCacheSet.mockResolvedValue(undefined);

      await setCachedPublicJob("senior-engineer", data);

      expect(mockCacheSet).toHaveBeenCalledWith("public:jobs:detail:senior-engineer", data, 120);
    });
  });

  describe("invalidatePublicJobCache", () => {
    it("deletes the list key when no slug is provided", async () => {
      mockCacheDel.mockResolvedValue(undefined);

      await invalidatePublicJobCache();

      expect(mockCacheDel).toHaveBeenCalledWith("public:jobs:list");
      expect(mockCacheDel).toHaveBeenCalledTimes(1);
    });

    it("deletes both list and detail key when slug is provided", async () => {
      mockCacheDel.mockResolvedValue(undefined);

      await invalidatePublicJobCache("senior-engineer");

      expect(mockCacheDel).toHaveBeenCalledWith("public:jobs:list");
      expect(mockCacheDel).toHaveBeenCalledWith("public:jobs:detail:senior-engineer");
      expect(mockCacheDel).toHaveBeenCalledTimes(2);
    });
  });
});
