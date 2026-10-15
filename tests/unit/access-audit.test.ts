import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInsert = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: () => ({ insert: (...args: unknown[]) => mockInsert(...args) }),
  }),
}));

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
vi.mock("@/lib/observability/logger", () => ({ logger: mockLogger }));

describe("access-audit fail policy (PII-005)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when the audit insert succeeds", async () => {
    mockInsert.mockResolvedValue({ error: null });
    const { writeAccessAuditEvent } = await import("@/lib/security/access-audit");
    const ok = await writeAccessAuditEvent({
      userId: "u1",
      candidateId: "c1",
      action: "view_pii",
    });
    expect(ok).toBe(true);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("detects a Supabase {error} result (previously swallowed) and retries", async () => {
    mockInsert.mockResolvedValue({ error: { message: "insert failed" } });
    const { writeAccessAuditEvent } = await import("@/lib/security/access-audit");
    const ok = await writeAccessAuditEvent({
      userId: "u1",
      candidateId: "c1",
      action: "view_pii",
    });
    expect(ok).toBe(false);
    // Bounded retry: 3 attempts.
    expect(mockInsert).toHaveBeenCalledTimes(3);
    // High-sensitivity action → error-level alert.
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it("succeeds on a later retry attempt", async () => {
    mockInsert
      .mockResolvedValueOnce({ error: { message: "transient" } })
      .mockResolvedValueOnce({ error: null });
    const { writeAccessAuditEvent } = await import("@/lib/security/access-audit");
    const ok = await writeAccessAuditEvent({ userId: "u1", candidateId: "c1", action: "view_pii" });
    expect(ok).toBe(true);
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it("throws AuditWriteError when failClosed and the write fails", async () => {
    mockInsert.mockResolvedValue({ error: { message: "down" } });
    const { writeAccessAuditEvent, AuditWriteError } = await import("@/lib/security/access-audit");
    await expect(
      writeAccessAuditEvent(
        { userId: "u1", candidateId: "c1", action: "download_cv" },
        { failClosed: true },
      ),
    ).rejects.toBeInstanceOf(AuditWriteError);
  });

  it("batch: no-ops (true) for an empty candidate list without inserting", async () => {
    const { writeAccessAuditBatch } = await import("@/lib/security/access-audit");
    const ok = await writeAccessAuditBatch("u1", [], "view_pii", {});
    expect(ok).toBe(true);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("batch: returns false and logs on failure (fail-open by default)", async () => {
    mockInsert.mockResolvedValue({ error: { message: "boom" } });
    const { writeAccessAuditBatch } = await import("@/lib/security/access-audit");
    const ok = await writeAccessAuditBatch("u1", ["c1", "c2"], "view_pii", { route: "x" });
    expect(ok).toBe(false);
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
