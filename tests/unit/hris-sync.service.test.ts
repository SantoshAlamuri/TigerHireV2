import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetConnection = vi.fn();
const mockRetrieveSecret = vi.fn();
const mockValidateKekaConnection = vi.fn();

vi.mock("@/lib/repositories/integration-connections.repository", () => ({
  getConnection: (...args: unknown[]) => mockGetConnection(...args),
}));

vi.mock("@/lib/services/secrets", () => ({
  retrieveSecret: (...args: unknown[]) => mockRetrieveSecret(...args),
}));

vi.mock("@/lib/integrations/providers/keka", () => ({
  validateKekaConnection: (...args: unknown[]) => mockValidateKekaConnection(...args),
}));

vi.mock("@/lib/integrations/providers/darwinbox", () => ({
  validateDarwinboxConnection: vi.fn(),
}));

vi.mock("@/lib/integrations/providers/hibob", () => ({
  validateHiBobConnection: vi.fn(),
}));

vi.mock("@/lib/integrations/providers/bamboohr", () => ({
  validateBambooHrConnection: vi.fn(),
}));

vi.mock("@/lib/integrations/providers/workday", () => ({
  validateWorkdayConnection: vi.fn(),
}));

describe("executeHrisSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a gap summary when connection is missing", async () => {
    mockGetConnection.mockResolvedValue(null);
    const { executeHrisSync } = await import("@/lib/integrations/hris/sync");
    const summary = await executeHrisSync({
      supabase: {} as never,
      organisationId: "org-1",
      provider: "keka",
      mode: "dry_run",
    });

    expect(summary.connectivity.ok).toBe(false);
    expect(summary.report.gapCount).toBeGreaterThanOrEqual(1);
  });

  it("runs provider validation when connection exists", async () => {
    mockGetConnection.mockResolvedValue({
      secret_ref: "secret-ref",
      config: {},
    });
    mockRetrieveSecret.mockResolvedValue("keka_key");
    mockValidateKekaConnection.mockResolvedValue({
      ok: true,
      message: "validated",
    });

    const { executeHrisSync } = await import("@/lib/integrations/hris/sync");
    const summary = await executeHrisSync({
      supabase: {} as never,
      organisationId: "org-1",
      provider: "keka",
      mode: "dry_run",
    });

    expect(summary.connectivity.ok).toBe(true);
    expect(summary.connectivity.message).toContain("validated");
    expect(mockValidateKekaConnection).toHaveBeenCalled();
  });
});
