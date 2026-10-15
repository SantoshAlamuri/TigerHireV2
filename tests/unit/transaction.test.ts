import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRpc = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => ({ rpc: mockRpc })),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("executeTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls RPC and returns data on success", async () => {
    mockRpc.mockResolvedValue({ data: { id: "abc" }, error: null });

    const { executeTransaction } = await import("@/lib/supabase/transaction");
    const fallback = vi.fn();
    const result = await executeTransaction("my_rpc", { p_id: "123" }, fallback);

    expect(result).toEqual({ id: "abc" });
    expect(mockRpc).toHaveBeenCalledWith("my_rpc", { p_id: "123" });
    expect(fallback).not.toHaveBeenCalled();
  });

  it("falls back when RPC returns an error", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "function not found" },
    });

    const { executeTransaction } = await import("@/lib/supabase/transaction");
    const { logger } = await import("@/lib/observability/logger");
    const fallback = vi.fn().mockResolvedValue({ fallback: true });

    const result = await executeTransaction("missing_rpc", {}, fallback);

    expect(result).toEqual({ fallback: true });
    expect(fallback).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("missing_rpc"),
      expect.objectContaining({ error: "function not found" }),
    );
  });

  it("falls back when data is null (no error)", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const { executeTransaction } = await import("@/lib/supabase/transaction");
    const fallback = vi.fn().mockResolvedValue("fallback-value");

    const result = await executeTransaction("some_rpc", {}, fallback);

    expect(result).toBe("fallback-value");
    expect(fallback).toHaveBeenCalled();
  });

  it("passes params correctly to RPC", async () => {
    const params = {
      p_application_id: "app-1",
      p_status: "hired",
      p_user_id: "user-1",
    };
    mockRpc.mockResolvedValue({ data: { ok: true }, error: null });

    const { executeTransaction } = await import("@/lib/supabase/transaction");
    await executeTransaction("update_application_status_tx", params, vi.fn());

    expect(mockRpc).toHaveBeenCalledWith("update_application_status_tx", params);
  });
});
