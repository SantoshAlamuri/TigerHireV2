import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockQueryBuilder } from "../helpers";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}));

const mockLoggerError = vi.fn();
vi.mock("@/lib/observability/logger", () => ({
  logger: {
    info: vi.fn(),
    error: (...args: unknown[]) => mockLoggerError(...args),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("NotificationService", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockLoggerError.mockReset();
  });

  describe("createNotification", () => {
    it("inserts notification row with correct fields", async () => {
      const builder = createMockQueryBuilder({ data: { id: "n-1" } });
      mockFrom.mockReturnValue(builder);
      const { createNotification } = await import("@/lib/services/notifications");

      const ok = await createNotification({
        userId: "u-1",
        type: "match_alert",
        title: "New match!",
        body: "You have a new match",
        link: "/candidate/matches",
        metadata: { jobId: "j-1" },
      });

      expect(ok).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith("notifications");
      expect(builder.insert).toHaveBeenCalledWith({
        user_id: "u-1",
        type: "match_alert",
        title: "New match!",
        body: "You have a new match",
        link: "/candidate/matches",
        metadata: { jobId: "j-1" },
      });
    });

    it("defaults optional fields to null/empty when omitted", async () => {
      const builder = createMockQueryBuilder({ data: { id: "n-2" } });
      mockFrom.mockReturnValue(builder);
      const { createNotification } = await import("@/lib/services/notifications");

      const ok = await createNotification({
        userId: "u-2",
        type: "match_alert",
        title: "Test",
      });

      expect(ok).toBe(true);
      expect(builder.insert).toHaveBeenCalledWith({
        user_id: "u-2",
        type: "match_alert",
        title: "Test",
        body: null,
        link: null,
        metadata: {},
      });
    });

    it("handles DB error gracefully without throwing", async () => {
      const builder = createMockQueryBuilder({ data: null, error: { message: "DB error" } });
      mockFrom.mockReturnValue(builder);
      const { createNotification } = await import("@/lib/services/notifications");

      const ok = await createNotification({
        userId: "u-1",
        type: "match_alert",
        title: "Test",
      });
      expect(ok).toBe(false);
    });

    it("logs error when insert fails", async () => {
      const builder = createMockQueryBuilder({ data: null, error: { message: "DB error" } });
      mockFrom.mockReturnValue(builder);
      const { createNotification } = await import("@/lib/services/notifications");

      const ok = await createNotification({
        userId: "u-1",
        type: "match_alert",
        title: "Test",
      });

      expect(ok).toBe(false);
      expect(mockLoggerError).toHaveBeenCalledWith(
        "Notification insert failed",
        expect.objectContaining({ error: expect.any(String) }),
      );
    });

    it("does not log error on successful insert", async () => {
      const builder = createMockQueryBuilder({ data: { id: "n-1" }, error: null });
      mockFrom.mockReturnValue(builder);
      const { createNotification } = await import("@/lib/services/notifications");

      const ok = await createNotification({
        userId: "u-1",
        type: "match_alert",
        title: "Success",
      });

      expect(ok).toBe(true);
      expect(mockLoggerError).not.toHaveBeenCalled();
    });
  });

  describe("createNotificationBatch", () => {
    it("creates notifications for multiple users in a single insert", async () => {
      const builder = createMockQueryBuilder({ data: [{ id: "n-1" }, { id: "n-2" }] });
      mockFrom.mockReturnValue(builder);
      const { createNotificationBatch } = await import("@/lib/services/notifications");

      await createNotificationBatch(["u-1", "u-2"], {
        type: "match_alert",
        title: "Batch notification",
        body: "body text",
      });

      expect(mockFrom).toHaveBeenCalledWith("notifications");
      expect(builder.insert).toHaveBeenCalledWith([
        {
          user_id: "u-1",
          type: "match_alert",
          title: "Batch notification",
          body: "body text",
          link: null,
          metadata: {},
        },
        {
          user_id: "u-2",
          type: "match_alert",
          title: "Batch notification",
          body: "body text",
          link: null,
          metadata: {},
        },
      ]);
    });

    it("handles empty user array by returning early", async () => {
      const builder = createMockQueryBuilder({ data: [] });
      mockFrom.mockReturnValue(builder);
      const { createNotificationBatch } = await import("@/lib/services/notifications");

      await expect(
        createNotificationBatch([], {
          type: "match_alert",
          title: "Empty batch",
        }),
      ).resolves.not.toThrow();

      // Should not even call from() since it returns early
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("logs error on batch insert failure", async () => {
      const builder = createMockQueryBuilder({
        data: null,
        error: { message: "batch insert error" },
      });
      mockFrom.mockReturnValue(builder);
      const { createNotificationBatch } = await import("@/lib/services/notifications");

      await createNotificationBatch(["u-1"], {
        type: "match_alert",
        title: "Failing batch",
      });

      expect(mockLoggerError).toHaveBeenCalledWith(
        "Notification batch insert failed",
        expect.objectContaining({ error: expect.any(String) }),
      );
    });

    it("passes link and metadata through for batch", async () => {
      const builder = createMockQueryBuilder({ data: [{ id: "n-1" }] });
      mockFrom.mockReturnValue(builder);
      const { createNotificationBatch } = await import("@/lib/services/notifications");

      await createNotificationBatch(["u-1"], {
        type: "match_alert",
        title: "With extras",
        link: "/jobs/123",
        metadata: { source: "cron" },
      });

      expect(builder.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          link: "/jobs/123",
          metadata: { source: "cron" },
        }),
      ]);
    });
  });
});
