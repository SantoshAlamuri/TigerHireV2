import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();
const mockCacheDel = vi.fn();

vi.mock("@/lib/redis/cache", () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
  cacheDel: (...args: unknown[]) => mockCacheDel(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  getCachedJobList,
  setCachedJobList,
  getCachedJobDetail,
  setCachedJobDetail,
  invalidateJobCache,
} from "@/lib/redis/job-cache";

describe("job-cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCachedJobList", () => {
    it("calls cacheGet with the correct prefixed key", async () => {
      const data = { jobs: [{ id: "j1" }], pagination: { page: 1 } };
      mockCacheGet.mockResolvedValue(data);

      const result = await getCachedJobList("org:org-1");

      expect(mockCacheGet).toHaveBeenCalledWith("jobs:list:org:org-1");
      expect(result).toEqual(data);
    });

    it("returns null on cache miss", async () => {
      mockCacheGet.mockResolvedValue(null);

      const result = await getCachedJobList("org:org-2");

      expect(result).toBeNull();
    });
  });

  describe("setCachedJobList", () => {
    it("calls cacheSet with prefix, data, and 600s TTL", async () => {
      const data = { jobs: [{ id: "j1" }], pagination: { page: 1 } };
      mockCacheSet.mockResolvedValue(undefined);

      await setCachedJobList("org:org-1", data);

      expect(mockCacheSet).toHaveBeenCalledWith("jobs:list:org:org-1", data, 600);
    });
  });

  describe("getCachedJobDetail", () => {
    it("calls cacheGet with the detail prefix", async () => {
      const data = { id: "j1", title: "Engineer" };
      mockCacheGet.mockResolvedValue(data);

      const result = await getCachedJobDetail("j1");

      expect(mockCacheGet).toHaveBeenCalledWith("jobs:detail:j1");
      expect(result).toEqual(data);
    });

    it("returns null on cache miss", async () => {
      mockCacheGet.mockResolvedValue(null);

      const result = await getCachedJobDetail("j-missing");

      expect(result).toBeNull();
    });
  });

  describe("setCachedJobDetail", () => {
    it("calls cacheSet with prefix, data, and 120s TTL", async () => {
      const data = { id: "j1", title: "Engineer" };
      mockCacheSet.mockResolvedValue(undefined);

      await setCachedJobDetail("j1", data);

      expect(mockCacheSet).toHaveBeenCalledWith("jobs:detail:j1", data, 120);
    });
  });

  describe("invalidateJobCache", () => {
    it("deletes detail key when jobId is provided", async () => {
      mockCacheDel.mockResolvedValue(undefined);

      await invalidateJobCache("j1");

      expect(mockCacheDel).toHaveBeenCalledWith("jobs:detail:j1");
      expect(mockCacheDel).toHaveBeenCalledTimes(1);
    });

    it("deletes list key when orgId is provided", async () => {
      mockCacheDel.mockResolvedValue(undefined);

      await invalidateJobCache(undefined, "org-1");

      expect(mockCacheDel).toHaveBeenCalledWith("jobs:list:org:org-1");
      expect(mockCacheDel).toHaveBeenCalledTimes(1);
    });

    it("deletes both keys when both are provided", async () => {
      mockCacheDel.mockResolvedValue(undefined);

      await invalidateJobCache("j1", "org-1");

      expect(mockCacheDel).toHaveBeenCalledWith("jobs:detail:j1");
      expect(mockCacheDel).toHaveBeenCalledWith("jobs:list:org:org-1");
      expect(mockCacheDel).toHaveBeenCalledTimes(2);
    });

    it("no-op when neither jobId nor orgId is provided", async () => {
      await invalidateJobCache();

      expect(mockCacheDel).not.toHaveBeenCalled();
    });
  });
});
