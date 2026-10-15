import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase } from "../helpers";

const mockCreateSupabaseAdmin = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/services/ConsentService", () => ({
  ConsentService: { hasRequiredConsent: vi.fn() },
}));

vi.mock("@/lib/acknowledgements/notifier", () => ({
  buildCandidateAcknowledgementPlan: vi.fn(),
}));

vi.mock("@/lib/services/resend", () => ({
  sendEmailIntakeAcknowledgement: vi.fn(),
}));

vi.mock("@/lib/services/whatsapp", () => ({
  sendWhatsAppMessage: vi.fn(),
}));

vi.mock("@/lib/acknowledgements/log", () => ({
  logCandidateAcknowledgementAttempt: vi.fn(),
}));

vi.mock("@/lib/acknowledgements/idempotency", () => ({
  hasSentAttemptWithinWindow: vi.fn(),
}));

describe("acknowledgements/email-intake", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockCreateSupabaseAdmin.mockReturnValue(createMockSupabase());
  });

  it("attempts both channels when enabled and contact + consent allow", async () => {
    const { buildCandidateAcknowledgementPlan } = await import("@/lib/acknowledgements/notifier");
    const { ConsentService } = await import("@/lib/services/ConsentService");
    const { sendEmailIntakeAcknowledgement } = await import("@/lib/services/resend");
    const { sendWhatsAppMessage } = await import("@/lib/services/whatsapp");
    const { hasSentAttemptWithinWindow } = await import("@/lib/acknowledgements/idempotency");
    const { logCandidateAcknowledgementAttempt } = await import("@/lib/acknowledgements/log");

    (buildCandidateAcknowledgementPlan as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: true,
      channels: [
        { channel: "email", shouldAttempt: true },
        { channel: "whatsapp", shouldAttempt: true },
      ],
    });
    (ConsentService.hasRequiredConsent as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (hasSentAttemptWithinWindow as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (sendEmailIntakeAcknowledgement as ReturnType<typeof vi.fn>).mockResolvedValue({
      skipped: false,
      data: { data: { id: "msg_1" } },
    });
    (sendWhatsAppMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      messageId: "wa_1",
    });

    const { notifyCvIngestedFromEmailIntake } = await import("@/lib/acknowledgements/email-intake");
    await notifyCvIngestedFromEmailIntake({
      applicationId: "app-1",
      candidateId: "cand-1",
      candidateName: "Jane Doe",
      candidatePhone: "+919999999999",
      candidateEmail: "jane@example.com",
      jobId: "job-1",
      jobTitle: "Backend Engineer",
      companyName: "Acme",
    });

    expect(sendEmailIntakeAcknowledgement).toHaveBeenCalledOnce();
    expect(sendWhatsAppMessage).toHaveBeenCalledOnce();
    expect(logCandidateAcknowledgementAttempt).toHaveBeenCalledTimes(2);
  });

  it("logs duplicate suppression on retry", async () => {
    const { buildCandidateAcknowledgementPlan } = await import("@/lib/acknowledgements/notifier");
    const { ConsentService } = await import("@/lib/services/ConsentService");
    const { sendEmailIntakeAcknowledgement } = await import("@/lib/services/resend");
    const { sendWhatsAppMessage } = await import("@/lib/services/whatsapp");
    const { hasSentAttemptWithinWindow } = await import("@/lib/acknowledgements/idempotency");
    const { logCandidateAcknowledgementAttempt } = await import("@/lib/acknowledgements/log");

    (buildCandidateAcknowledgementPlan as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: true,
      channels: [
        { channel: "email", shouldAttempt: true },
        { channel: "whatsapp", shouldAttempt: true },
      ],
    });
    (ConsentService.hasRequiredConsent as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (hasSentAttemptWithinWindow as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    (sendEmailIntakeAcknowledgement as ReturnType<typeof vi.fn>).mockResolvedValue({
      skipped: false,
      data: { data: { id: "msg_1" } },
    });
    (sendWhatsAppMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      messageId: "wa_1",
    });

    const { notifyCvIngestedFromEmailIntake } = await import("@/lib/acknowledgements/email-intake");
    await notifyCvIngestedFromEmailIntake({
      applicationId: "app-1",
      candidateId: "cand-1",
      candidateName: "Jane Doe",
      candidatePhone: "+919999999999",
      candidateEmail: "jane@example.com",
      jobId: "job-1",
      jobTitle: "Backend Engineer",
      companyName: "Acme",
    });
    await notifyCvIngestedFromEmailIntake({
      applicationId: "app-1",
      candidateId: "cand-1",
      candidateName: "Jane Doe",
      candidatePhone: "+919999999999",
      candidateEmail: "jane@example.com",
      jobId: "job-1",
      jobTitle: "Backend Engineer",
      companyName: "Acme",
    });

    expect(sendEmailIntakeAcknowledgement).toHaveBeenCalledTimes(1);
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    const rows = (logCandidateAcknowledgementAttempt as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[0],
    );
    expect(
      rows.some(
        (r: { reasonCode?: string; outcome?: string }) =>
          r.reasonCode === "duplicate" && r.outcome === "suppressed_duplicate",
      ),
    ).toBe(true);
  });
});
