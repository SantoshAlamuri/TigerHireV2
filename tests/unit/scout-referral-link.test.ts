import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockQueryBuilder } from "../helpers";

const mockLoggerInfo = vi.fn();

vi.mock("@/lib/observability/logger", () => ({
  logger: {
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("linkReferralCandidateIfNeeded", () => {
  beforeEach(() => {
    vi.resetModules();
    mockLoggerInfo.mockReset();
  });

  it("returns missing_referral_id when session has no referral id", async () => {
    const { linkReferralCandidateIfNeeded } = await import("@/lib/agents/scout-referral-link");
    const supabase = { from: vi.fn() } as unknown as Parameters<
      typeof linkReferralCandidateIfNeeded
    >[0];

    const result = await linkReferralCandidateIfNeeded(supabase, null, "cand-1");
    expect(result).toEqual({ linked: false, reason: "no_referral_id" });
    expect((supabase as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "metric.referrals_candidate_linked",
      expect.objectContaining({
        candidate_id: "cand-1",
        linked: false,
        reason: "no_referral_id",
      }),
    );
  });

  it("links candidate id and updates status to cv_received", async () => {
    const { linkReferralCandidateIfNeeded } = await import("@/lib/agents/scout-referral-link");

    const selectBuilder = createMockQueryBuilder({
      data: { id: "ref-1", candidate_id: null, status: "pending" },
      error: null,
    });
    const updateBuilder = createMockQueryBuilder({ data: null, error: null });

    let calls = 0;
    const supabase = {
      from: vi.fn((table: string) => {
        if (table !== "referrals") throw new Error(`Unexpected table ${table}`);
        calls += 1;
        return calls === 1 ? selectBuilder : updateBuilder;
      }),
    } as unknown as Parameters<typeof linkReferralCandidateIfNeeded>[0];

    const result = await linkReferralCandidateIfNeeded(supabase, "ref-1", "cand-1");

    expect(result).toEqual({ linked: true, reason: "linked" });
    expect(updateBuilder.update).toHaveBeenCalledWith({
      candidate_id: "cand-1",
      status: "cv_received",
    });
    expect(updateBuilder.eq).toHaveBeenCalledWith("id", "ref-1");
    expect(updateBuilder.is).toHaveBeenCalledWith("candidate_id", null);
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "metric.referrals_candidate_linked",
      expect.objectContaining({
        referral_id: "ref-1",
        candidate_id: "cand-1",
        linked: true,
        reason: "linked",
      }),
    );
  });

  it("does not overwrite when referral is linked to another candidate", async () => {
    const { linkReferralCandidateIfNeeded } = await import("@/lib/agents/scout-referral-link");
    const selectBuilder = createMockQueryBuilder({
      data: { id: "ref-1", candidate_id: "cand-existing", status: "vouched" },
      error: null,
    });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table !== "referrals") throw new Error(`Unexpected table ${table}`);
        return selectBuilder;
      }),
    } as unknown as Parameters<typeof linkReferralCandidateIfNeeded>[0];

    const result = await linkReferralCandidateIfNeeded(supabase, "ref-1", "cand-new");

    expect(result).toEqual({ linked: false, reason: "conflict_other_candidate" });
    expect(selectBuilder.update).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "metric.referrals_candidate_linked",
      expect.objectContaining({
        referral_id: "ref-1",
        candidate_id: "cand-new",
        linked: false,
        reason: "conflict_other_candidate",
      }),
    );
  });
});
