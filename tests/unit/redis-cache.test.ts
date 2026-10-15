import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRedis = {
  get: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
};

vi.mock("@/lib/redis/client", () => ({
  getRedis: vi.fn(() => mockRedis),
}));

describe("Redis cache utilities", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  describe("cacheGet", () => {
    it("returns parsed JSON when value is a JSON string", async () => {
      const { getRedis } = await import("@/lib/redis/client");
      const redis = {
        get: vi.fn().mockResolvedValue('{"role":"admin"}'),
        setex: vi.fn(),
        del: vi.fn(),
      };
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(redis);

      const { cacheGet } = await import("@/lib/redis/cache");
      const result = await cacheGet<{ role: string }>("test-key");

      expect(result).toEqual({ role: "admin" });
      expect(redis.get).toHaveBeenCalledWith("test-key");
    });

    it("returns raw string when value is not valid JSON", async () => {
      const { getRedis } = await import("@/lib/redis/client");
      const redis = {
        get: vi.fn().mockResolvedValue("plain-string"),
        setex: vi.fn(),
        del: vi.fn(),
      };
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(redis);

      const { cacheGet } = await import("@/lib/redis/cache");
      const result = await cacheGet("test-key");

      expect(result).toBe("plain-string");
    });

    it("returns null when key does not exist", async () => {
      const { getRedis } = await import("@/lib/redis/client");
      const redis = {
        get: vi.fn().mockResolvedValue(null),
        setex: vi.fn(),
        del: vi.fn(),
      };
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(redis);

      const { cacheGet } = await import("@/lib/redis/cache");
      const result = await cacheGet("missing-key");

      expect(result).toBeNull();
    });

    it("returns null when Redis is unavailable", async () => {
      const { getRedis } = await import("@/lib/redis/client");
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const { cacheGet } = await import("@/lib/redis/cache");
      const result = await cacheGet("any-key");

      expect(result).toBeNull();
    });

    it("returns null when Redis throws", async () => {
      const { getRedis } = await import("@/lib/redis/client");
      const redis = {
        get: vi.fn().mockRejectedValue(new Error("connection refused")),
        setex: vi.fn(),
        del: vi.fn(),
      };
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(redis);

      const { cacheGet } = await import("@/lib/redis/cache");
      const result = await cacheGet("fail-key");

      expect(result).toBeNull();
    });

    it("returns non-string values directly", async () => {
      const { getRedis } = await import("@/lib/redis/client");
      const redis = {
        get: vi.fn().mockResolvedValue(42),
        setex: vi.fn(),
        del: vi.fn(),
      };
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(redis);

      const { cacheGet } = await import("@/lib/redis/cache");
      const result = await cacheGet<number>("num-key");

      expect(result).toBe(42);
    });
  });

  describe("cacheSet", () => {
    it("serializes and stores value with default TTL", async () => {
      const { getRedis } = await import("@/lib/redis/client");
      const redis = {
        get: vi.fn(),
        setex: vi.fn().mockResolvedValue("OK"),
        del: vi.fn(),
      };
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(redis);

      const { cacheSet } = await import("@/lib/redis/cache");
      await cacheSet("my-key", { foo: "bar" });

      expect(redis.setex).toHaveBeenCalledWith("my-key", 300, '{"foo":"bar"}');
    });

    it("stores string values directly", async () => {
      const { getRedis } = await import("@/lib/redis/client");
      const redis = {
        get: vi.fn(),
        setex: vi.fn().mockResolvedValue("OK"),
        del: vi.fn(),
      };
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(redis);

      const { cacheSet } = await import("@/lib/redis/cache");
      await cacheSet("str-key", "hello", 60);

      expect(redis.setex).toHaveBeenCalledWith("str-key", 60, "hello");
    });

    it("uses custom TTL", async () => {
      const { getRedis } = await import("@/lib/redis/client");
      const redis = {
        get: vi.fn(),
        setex: vi.fn().mockResolvedValue("OK"),
        del: vi.fn(),
      };
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(redis);

      const { cacheSet } = await import("@/lib/redis/cache");
      await cacheSet("ttl-key", "value", 120);

      expect(redis.setex).toHaveBeenCalledWith("ttl-key", 120, "value");
    });

    it("no-op when Redis is unavailable", async () => {
      const { getRedis } = await import("@/lib/redis/client");
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const { cacheSet } = await import("@/lib/redis/cache");
      await expect(cacheSet("any-key", "val")).resolves.toBeUndefined();
    });

    it("fails silently when Redis throws", async () => {
      const { getRedis } = await import("@/lib/redis/client");
      const redis = {
        get: vi.fn(),
        setex: vi.fn().mockRejectedValue(new Error("write error")),
        del: vi.fn(),
      };
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(redis);

      const { cacheSet } = await import("@/lib/redis/cache");
      await expect(cacheSet("fail-key", "val")).resolves.toBeUndefined();
    });
  });

  describe("cacheDel", () => {
    it("deletes a key from Redis", async () => {
      const { getRedis } = await import("@/lib/redis/client");
      const redis = {
        get: vi.fn(),
        setex: vi.fn(),
        del: vi.fn().mockResolvedValue(1),
      };
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(redis);

      const { cacheDel } = await import("@/lib/redis/cache");
      await cacheDel("del-key");

      expect(redis.del).toHaveBeenCalledWith("del-key");
    });

    it("no-op when Redis is unavailable", async () => {
      const { getRedis } = await import("@/lib/redis/client");
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const { cacheDel } = await import("@/lib/redis/cache");
      await expect(cacheDel("any-key")).resolves.toBeUndefined();
    });

    it("fails silently when Redis throws", async () => {
      const { getRedis } = await import("@/lib/redis/client");
      const redis = {
        get: vi.fn(),
        setex: vi.fn(),
        del: vi.fn().mockRejectedValue(new Error("del error")),
      };
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(redis);

      const { cacheDel } = await import("@/lib/redis/cache");
      await expect(cacheDel("fail-key")).resolves.toBeUndefined();
    });
  });

  describe("auth-profile-cache", () => {
    it("getCachedAuthProfile reads from cache with correct key", async () => {
      const { getRedis } = await import("@/lib/redis/client");
      const redis = {
        get: vi.fn().mockResolvedValue('{"role":"recruiter","organisation_id":"org-1"}'),
        setex: vi.fn(),
        del: vi.fn(),
      };
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(redis);

      const { getCachedAuthProfile } = await import("@/lib/redis/auth-profile-cache");
      const result = await getCachedAuthProfile("user-123");

      expect(result).toEqual({ role: "recruiter", organisation_id: "org-1" });
      expect(redis.get).toHaveBeenCalledWith("auth:profile:v2:user-123");
    });

    it("getCachedAuthProfile returns null when not cached", async () => {
      const { getRedis } = await import("@/lib/redis/client");
      const redis = {
        get: vi.fn().mockResolvedValue(null),
        setex: vi.fn(),
        del: vi.fn(),
      };
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(redis);

      const { getCachedAuthProfile } = await import("@/lib/redis/auth-profile-cache");
      const result = await getCachedAuthProfile("user-missing");

      expect(result).toBeNull();
    });

    it("setCachedAuthProfile stores profile with correct TTL", async () => {
      const { getRedis } = await import("@/lib/redis/client");
      const redis = {
        get: vi.fn(),
        setex: vi.fn().mockResolvedValue("OK"),
        del: vi.fn(),
      };
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(redis);

      const { setCachedAuthProfile } = await import("@/lib/redis/auth-profile-cache");
      await setCachedAuthProfile("user-123", {
        role: "leadership" as never,
        organisation_id: "org-1",
      });

      expect(redis.setex).toHaveBeenCalledWith(
        "auth:profile:v2:user-123",
        60,
        '{"role":"leadership","organisation_id":"org-1"}',
      );
    });

    it("deleteCachedAuthProfile removes the key", async () => {
      const { getRedis } = await import("@/lib/redis/client");
      const redis = {
        get: vi.fn(),
        setex: vi.fn(),
        del: vi.fn().mockResolvedValue(1),
      };
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(redis);

      const { deleteCachedAuthProfile } = await import("@/lib/redis/auth-profile-cache");
      await deleteCachedAuthProfile("user-123");

      expect(redis.del).toHaveBeenCalledWith("auth:profile:v2:user-123");
    });
  });
});
