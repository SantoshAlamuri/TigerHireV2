import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: vi.fn().mockReturnValue({ insert: mockInsert }),
  }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("appendToDlq", () => {
  beforeEach(() => {
    mockInsert.mockClear();
  });

  it("inserts failed operation into dead letter queue", async () => {
    const { appendToDlq } = await import("@/lib/utils/dlq");
    await appendToDlq("email_send", { to: "user@test.com" }, "SMTP error");

    expect(mockInsert).toHaveBeenCalledWith({
      operation_type: "email_send",
      payload: { to: "user@test.com" },
      error_message: "SMTP error",
    });
  });

  it("handles null error message", async () => {
    const { appendToDlq } = await import("@/lib/utils/dlq");
    await appendToDlq("webhook_retry", { url: "/webhook" });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ error_message: null }));
  });

  it("does not throw when insert fails", async () => {
    mockInsert.mockResolvedValue({ error: { message: "DB error" } });
    const { appendToDlq } = await import("@/lib/utils/dlq");
    await expect(appendToDlq("broken_op", { data: "test" }, "err")).resolves.toBeUndefined();
  });

  it("does not throw when supabase throws", async () => {
    mockInsert.mockRejectedValue(new Error("connection failed"));
    const { appendToDlq } = await import("@/lib/utils/dlq");
    await expect(appendToDlq("throw_op", {}, "err")).resolves.toBeUndefined();
  });
});
