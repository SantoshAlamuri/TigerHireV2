import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: vi.fn(),
}));

describe("acknowledgements/notifier", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("suppresses all channels when global notifier flag is disabled", async () => {
    const { isEnabled } = await import("@/lib/feature-flags");
    (isEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const { buildCandidateAcknowledgementPlan } = await import("@/lib/acknowledgements/notifier");

    const plan = await buildCandidateAcknowledgementPlan({
      candidateId: "cand-1",
      eventType: "cv_ingested",
      ingestionPath: "public_apply",
    });

    expect(plan.enabled).toBe(false);
    expect(plan.channels).toEqual([
      { channel: "email", shouldAttempt: false, suppressionReasonCode: "notifier_disabled" },
      { channel: "whatsapp", shouldAttempt: false, suppressionReasonCode: "notifier_disabled" },
    ]);
  });

  it("attempts both channels when flags are enabled and channels are available", async () => {
    const { isEnabled } = await import("@/lib/feature-flags");
    (isEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const { buildCandidateAcknowledgementPlan } = await import("@/lib/acknowledgements/notifier");

    const plan = await buildCandidateAcknowledgementPlan({
      candidateId: "cand-1",
      eventType: "cv_ingested",
      ingestionPath: "logged_in_apply",
      candidateEmail: "user@example.com",
      candidatePhone: "+919999999999",
      emailConsent: true,
      whatsappConsent: true,
    });

    expect(plan.enabled).toBe(true);
    expect(plan.channels).toEqual([
      { channel: "email", shouldAttempt: true },
      { channel: "whatsapp", shouldAttempt: true },
    ]);
  });

  it("marks channel suppressions for missing contact and no consent", async () => {
    const { isEnabled } = await import("@/lib/feature-flags");
    (isEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const { buildCandidateAcknowledgementPlan } = await import("@/lib/acknowledgements/notifier");

    const plan = await buildCandidateAcknowledgementPlan({
      candidateId: "cand-1",
      eventType: "cv_ingested",
      ingestionPath: "public_apply",
      candidateEmail: null,
      candidatePhone: "+919999999999",
      whatsappConsent: false,
    });

    expect(plan.channels).toEqual([
      { channel: "email", shouldAttempt: false, suppressionReasonCode: "no_channel" },
      { channel: "whatsapp", shouldAttempt: false, suppressionReasonCode: "no_consent" },
    ]);
  });
});
