import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/acknowledgements/notifier", () => ({
  buildCandidateAcknowledgementPlan: vi.fn(),
}));

vi.mock("@/lib/services/resend", () => ({
  sendApplicationConfirmation: vi.fn(),
}));

vi.mock("@/lib/services/whatsapp", () => ({
  sendApplicationReceivedTemplate: vi.fn(),
}));

vi.mock("@/lib/acknowledgements/log", () => ({
  logCandidateAcknowledgementAttempt: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => ({ from: vi.fn() })),
}));

vi.mock("@/lib/acknowledgements/idempotency", () => ({
  hasSentAttemptWithinWindow: vi.fn(),
}));

describe("acknowledgements/cv-ingested", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("falls back to legacy email-only behavior when notifier is disabled", async () => {
    const { buildCandidateAcknowledgementPlan } = await import("@/lib/acknowledgements/notifier");
    const { sendApplicationConfirmation } = await import("@/lib/services/resend");
    const { sendApplicationReceivedTemplate } = await import("@/lib/services/whatsapp");
    (buildCandidateAcknowledgementPlan as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: false,
      channels: [],
    });
    (sendApplicationConfirmation as ReturnType<typeof vi.fn>).mockResolvedValue({
      skipped: false,
      data: { data: { id: "msg_1" } },
    });

    const { notifyCvIngestedFromLoggedInApply } =
      await import("@/lib/acknowledgements/cv-ingested");
    await notifyCvIngestedFromLoggedInApply({
      applicationId: "app-1",
      candidateId: "cand-1",
      jobId: "job-1",
      candidateName: "Jane",
      candidateEmail: "jane@example.com",
      candidatePhone: "+919999999999",
      jobTitle: "Engineer",
      companyName: "Acme",
    });

    expect(sendApplicationConfirmation).toHaveBeenCalledOnce();
    expect(sendApplicationReceivedTemplate).not.toHaveBeenCalled();
  });

  it("logs suppression and sends enabled channels when notifier is enabled", async () => {
    const { buildCandidateAcknowledgementPlan } = await import("@/lib/acknowledgements/notifier");
    const { sendApplicationConfirmation } = await import("@/lib/services/resend");
    const { sendApplicationReceivedTemplate } = await import("@/lib/services/whatsapp");
    const { logCandidateAcknowledgementAttempt } = await import("@/lib/acknowledgements/log");
    const { hasSentAttemptWithinWindow } = await import("@/lib/acknowledgements/idempotency");
    (buildCandidateAcknowledgementPlan as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: true,
      channels: [
        { channel: "email", shouldAttempt: false, suppressionReasonCode: "no_channel" },
        { channel: "whatsapp", shouldAttempt: true },
      ],
    });
    (sendApplicationConfirmation as ReturnType<typeof vi.fn>).mockResolvedValue({
      skipped: false,
      data: { data: { id: "msg_1" } },
    });
    (sendApplicationReceivedTemplate as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      messageId: "wa_1",
    });
    (hasSentAttemptWithinWindow as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const { notifyCvIngestedFromLoggedInApply } =
      await import("@/lib/acknowledgements/cv-ingested");
    await notifyCvIngestedFromLoggedInApply({
      applicationId: "app-1",
      candidateId: "cand-1",
      jobId: "job-1",
      candidateName: "Jane",
      candidateEmail: null,
      candidatePhone: "+919999999999",
      jobTitle: "Engineer",
      companyName: "Acme",
    });

    expect(sendApplicationConfirmation).not.toHaveBeenCalled();
    expect(sendApplicationReceivedTemplate).toHaveBeenCalledOnce();
    expect(logCandidateAcknowledgementAttempt).toHaveBeenCalledTimes(2);
  });
});
