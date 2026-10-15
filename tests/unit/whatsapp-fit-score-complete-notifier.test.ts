import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockQueryBuilder, createMockSupabase } from "../helpers";

const mockSendThJobMatchResult = vi.fn();
const mockSendThJobNoMatch = vi.fn();
const mockSendWhatsAppMessage = vi.fn();

vi.mock("@/lib/services/whatsapp", () => ({
  sendThJobMatchResult: (...args: unknown[]) => mockSendThJobMatchResult(...args),
  sendThJobNoMatch: (...args: unknown[]) => mockSendThJobNoMatch(...args),
  sendWhatsAppMessage: (...args: unknown[]) => mockSendWhatsAppMessage(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("notifyWhatsAppFitScoreComplete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendThJobMatchResult.mockResolvedValue({ success: true });
    mockSendThJobNoMatch.mockResolvedValue({ success: true });
    mockSendWhatsAppMessage.mockResolvedValue({ success: true });
  });

  it("sends the score result and next steps with referral context", async () => {
    const supabase = createMockSupabase({
      candidates: createMockQueryBuilder({
        data: { phone: "+919999999999", name: "Asha Kumar", full_name: null },
      }),
      jobs: createMockQueryBuilder({
        data: {
          title: "QA Engineer",
          location: "Bangalore",
          organisations: { name: "Acme Ltd" },
        },
      }),
      fit_scores: createMockQueryBuilder({
        data: { overall_score: 82, band: "Strong Fit", verdict: null },
      }),
      applications: createMockQueryBuilder({
        data: {
          id: "app-1",
          source: "referral",
          direct_referrer_id: "ref-1",
          parent_referrer_id: null,
          referral_link_id: "link-1",
        },
      }),
    });

    const { notifyWhatsAppFitScoreComplete } =
      await import("@/lib/whatsapp/fit-score-complete-notifier");

    const result = await notifyWhatsAppFitScoreComplete(supabase, {
      jobId: "job-1",
      candidateId: "cand-1",
    });

    expect(result).toEqual({ sent: true });
    expect(mockSendThJobMatchResult).toHaveBeenCalledWith({
      phone: "+919999999999",
      name: "Asha",
      title: "QA Engineer",
      location: "Bangalore",
      score: 82,
      verdict: "Strong Fit",
    });
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "+919999999999",
      expect.stringContaining("Your referral context is attached"),
    );
  });

  it("skips cleanly when the candidate has no WhatsApp phone", async () => {
    const supabase = createMockSupabase({
      candidates: createMockQueryBuilder({ data: { phone: null, name: "Asha" } }),
      jobs: createMockQueryBuilder({ data: { title: "QA Engineer" } }),
      fit_scores: createMockQueryBuilder({ data: { overall_score: 82 } }),
      applications: createMockQueryBuilder({ data: null }),
    });

    const { notifyWhatsAppFitScoreComplete } =
      await import("@/lib/whatsapp/fit-score-complete-notifier");

    await expect(
      notifyWhatsAppFitScoreComplete(supabase, { jobId: "job-1", candidateId: "cand-1" }),
    ).resolves.toEqual({ sent: false, skipped: "candidate_phone_missing" });
    expect(mockSendThJobMatchResult).not.toHaveBeenCalled();
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("does not tell the candidate scoring failed when a database read failed", async () => {
    const scoreQuery = createMockQueryBuilder({
      data: null,
      error: { message: "schema cache unavailable" },
    });
    const supabase = createMockSupabase({
      candidates: createMockQueryBuilder({ data: { phone: "+919999999999", name: "Asha" } }),
      jobs: createMockQueryBuilder({ data: { title: "QA Engineer" } }),
      fit_scores: scoreQuery,
      applications: createMockQueryBuilder({ data: null }),
    });
    const { notifyWhatsAppFitScoreComplete } =
      await import("@/lib/whatsapp/fit-score-complete-notifier");
    await expect(
      notifyWhatsAppFitScoreComplete(supabase, { jobId: "job-1", candidateId: "cand-1" }),
    ).resolves.toEqual({ sent: false, skipped: "notification_data_unavailable" });
    expect(scoreQuery.select).toHaveBeenCalledWith("overall_score, band, verdict");
    expect(mockSendThJobMatchResult).not.toHaveBeenCalled();
    expect(mockSendThJobNoMatch).not.toHaveBeenCalled();
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });
});
