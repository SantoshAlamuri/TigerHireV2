import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, createMockQueryBuilder } from "../helpers";

describe("NotificationRepository", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("list", () => {
    it("returns notifications ordered by created_at descending", async () => {
      const notifications = [
        { id: "n1", user_id: "u1", title: "New" },
        { id: "n2", user_id: "u1", title: "Old" },
      ];
      const builder = createMockQueryBuilder({ data: notifications });
      const supabase = createMockSupabase({ notifications: builder });

      const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");
      const result = await NotificationRepository.list(supabase, "u1", 0, 10);

      expect(result).toEqual(notifications);
      expect(builder.eq).toHaveBeenCalledWith("user_id", "u1");
      expect(builder.order).toHaveBeenCalledWith("created_at", {
        ascending: false,
      });
      expect(builder.range).toHaveBeenCalledWith(0, 9);
    });

    it("applies offset and limit correctly", async () => {
      const builder = createMockQueryBuilder({ data: [] });
      const supabase = createMockSupabase({ notifications: builder });

      const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");
      await NotificationRepository.list(supabase, "u1", 20, 5);

      expect(builder.range).toHaveBeenCalledWith(20, 24);
    });

    it("returns empty array when data is null", async () => {
      const builder = createMockQueryBuilder({ data: null });
      const supabase = createMockSupabase({ notifications: builder });

      const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");
      const result = await NotificationRepository.list(supabase, "u1", 0, 10);

      expect(result).toEqual([]);
    });

    it("throws on error", async () => {
      const builder = createMockQueryBuilder({
        error: { message: "db error" },
      });
      const supabase = createMockSupabase({ notifications: builder });

      const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");
      await expect(NotificationRepository.list(supabase, "u1", 0, 10)).rejects.toBeDefined();
    });
  });

  describe("unreadCount", () => {
    it("returns unread notification count", async () => {
      const builder = createMockQueryBuilder({ count: 5 });
      const supabase = createMockSupabase({ notifications: builder });

      const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");
      const result = await NotificationRepository.unreadCount(supabase, "u1");

      expect(result).toBe(5);
      expect(builder.select).toHaveBeenCalledWith("id", {
        count: "exact",
        head: true,
      });
      expect(builder.eq).toHaveBeenCalledWith("user_id", "u1");
      expect(builder.eq).toHaveBeenCalledWith("read", false);
    });

    it("returns 0 when count is null", async () => {
      const builder = createMockQueryBuilder({
        count: null as unknown as number,
      });
      const supabase = createMockSupabase({ notifications: builder });

      const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");
      const result = await NotificationRepository.unreadCount(supabase, "u1");

      expect(result).toBe(0);
    });

    it("throws on error", async () => {
      const builder = createMockQueryBuilder({
        error: { message: "count error" },
      });
      const supabase = createMockSupabase({ notifications: builder });

      const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");
      await expect(NotificationRepository.unreadCount(supabase, "u1")).rejects.toBeDefined();
    });
  });

  describe("markRead", () => {
    it("updates specified notification IDs to read", async () => {
      const builder = createMockQueryBuilder();
      const supabase = createMockSupabase({ notifications: builder });

      const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");
      await NotificationRepository.markRead(supabase, "u1", ["n1", "n2"]);

      expect(builder.update).toHaveBeenCalledWith({ read: true });
      expect(builder.eq).toHaveBeenCalledWith("user_id", "u1");
      expect(builder.in).toHaveBeenCalledWith("id", ["n1", "n2"]);
    });

    it("throws on error", async () => {
      const builder = createMockQueryBuilder({
        error: { message: "update error" },
      });
      const supabase = createMockSupabase({ notifications: builder });

      const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");
      await expect(NotificationRepository.markRead(supabase, "u1", ["n1"])).rejects.toBeDefined();
    });
  });

  describe("markAllRead", () => {
    it("marks all unread notifications as read for user", async () => {
      const builder = createMockQueryBuilder();
      const supabase = createMockSupabase({ notifications: builder });

      const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");
      await NotificationRepository.markAllRead(supabase, "u1");

      expect(builder.update).toHaveBeenCalledWith({ read: true });
      expect(builder.eq).toHaveBeenCalledWith("user_id", "u1");
      expect(builder.eq).toHaveBeenCalledWith("read", false);
    });

    it("throws on error", async () => {
      const builder = createMockQueryBuilder({
        error: { message: "update error" },
      });
      const supabase = createMockSupabase({ notifications: builder });

      const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");
      await expect(NotificationRepository.markAllRead(supabase, "u1")).rejects.toBeDefined();
    });
  });

  describe("create", () => {
    it("inserts a notification with all fields", async () => {
      const builder = createMockQueryBuilder();
      const supabase = createMockSupabase({ notifications: builder });

      const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");
      await NotificationRepository.create(supabase, {
        userId: "u1",
        type: "job_match",
        title: "New match!",
        body: "You have a new job match.",
        link: "/jobs/j1",
        metadata: { jobId: "j1" },
      });

      expect(builder.insert).toHaveBeenCalledWith({
        user_id: "u1",
        type: "job_match",
        title: "New match!",
        body: "You have a new job match.",
        link: "/jobs/j1",
        metadata: { jobId: "j1" },
      });
    });

    it("uses null defaults for optional fields", async () => {
      const builder = createMockQueryBuilder();
      const supabase = createMockSupabase({ notifications: builder });

      const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");
      await NotificationRepository.create(supabase, {
        userId: "u1",
        type: "system",
        title: "Welcome",
      });

      expect(builder.insert).toHaveBeenCalledWith({
        user_id: "u1",
        type: "system",
        title: "Welcome",
        body: null,
        link: null,
        metadata: {},
      });
    });

    it("throws on insert error", async () => {
      const builder = createMockQueryBuilder({
        error: { message: "insert error" },
      });
      const supabase = createMockSupabase({ notifications: builder });

      const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");
      await expect(
        NotificationRepository.create(supabase, {
          userId: "u1",
          type: "system",
          title: "Fail",
        }),
      ).rejects.toBeDefined();
    });
  });

  describe("createBatch", () => {
    it("inserts multiple notifications at once", async () => {
      const builder = createMockQueryBuilder();
      const supabase = createMockSupabase({ notifications: builder });

      const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");
      await NotificationRepository.createBatch(supabase, [
        { userId: "u1", type: "system", title: "Hello" },
        {
          userId: "u2",
          type: "job_match",
          title: "Match",
          body: "You matched!",
          link: "/jobs/1",
        },
      ]);

      expect(builder.insert).toHaveBeenCalledWith([
        {
          user_id: "u1",
          type: "system",
          title: "Hello",
          body: null,
          link: null,
          metadata: {},
        },
        {
          user_id: "u2",
          type: "job_match",
          title: "Match",
          body: "You matched!",
          link: "/jobs/1",
          metadata: {},
        },
      ]);
    });

    it("skips insert for empty array", async () => {
      const builder = createMockQueryBuilder();
      const supabase = createMockSupabase({ notifications: builder });

      const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");
      await NotificationRepository.createBatch(supabase, []);

      expect(builder.insert).not.toHaveBeenCalled();
    });

    it("throws on batch insert error", async () => {
      const builder = createMockQueryBuilder({
        error: { message: "batch error" },
      });
      const supabase = createMockSupabase({ notifications: builder });

      const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");
      await expect(
        NotificationRepository.createBatch(supabase, [
          { userId: "u1", type: "system", title: "Fail" },
        ]),
      ).rejects.toBeDefined();
    });
  });
});
