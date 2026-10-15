import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockQueryBuilder, createMockSupabase } from "../helpers";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/acknowledgements/notifier", () => ({
  buildCandidateAcknowledgementPlan: vi.fn(),
}));

vi.mock("@/lib/agents/public-apply", () => ({
  sendPostApplyCandidatePortalNudge: vi.fn(),
}));

vi.mock("@/lib/services/ConsentService", () => ({
  ConsentService: { hasRequiredConsent: vi.fn() },
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

const mockCreateSupabaseAdmin = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

describe("acknowledgements/agency-single", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockCreateSupabaseAdmin.mockReturnValue(createMockSupabase());
  });

  it("falls back to legacy nudge when centralized notifier is disabled", async () => {
    const { buildCandidateAcknowledgementPlan } = await import("@/lib/acknowledgements/notifier");
    const { sendPostApplyCandidatePortalNudge } = await import("@/lib/agents/public-apply");
    const { ConsentService } = await import("@/lib/services/ConsentService");
    (buildCandidateAcknowledgementPlan as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: false,
      channels: [],
    });
    (ConsentService.hasRequiredConsent as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const { notifyCvIngestedFromAgencySingle } =
      await import("@/lib/acknowledgements/agency-single");
    await notifyCvIngestedFromAgencySingle({
      applicationId: "app-1",
      candidateId: "cand-1",
      candidateName: "Jane",
      candidatePhone: "+919999999999",
      jobId: "job-1",
      agencyName: "TalentBridge",
      companyName: "Acme",
    });

    expect(sendPostApplyCandidatePortalNudge).toHaveBeenCalledOnce();
  });

  it("suppresses when agency source attribution is missing/malformed", async () => {
    const { buildCandidateAcknowledgementPlan } = await import("@/lib/acknowledgements/notifier");
    const { ConsentService } = await import("@/lib/services/ConsentService");
    const { sendWhatsAppMessage } = await import("@/lib/services/whatsapp");
    const { logCandidateAcknowledgementAttempt } = await import("@/lib/acknowledgements/log");
    const { hasSentAttemptWithinWindow } = await import("@/lib/acknowledgements/idempotency");
    (buildCandidateAcknowledgementPlan as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: true,
      channels: [
        { channel: "email", shouldAttempt: false },
        { channel: "whatsapp", shouldAttempt: true },
      ],
    });
    (ConsentService.hasRequiredConsent as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (hasSentAttemptWithinWindow as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const { notifyCvIngestedFromAgencySingle } =
      await import("@/lib/acknowledgements/agency-single");
    await notifyCvIngestedFromAgencySingle({
      applicationId: "app-1",
      candidateId: "cand-1",
      candidateName: "Jane",
      candidatePhone: "+919999999999",
      jobId: "job-1",
      agencyName: "Agency",
      companyName: "Acme",
    });

    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
    const logged = (logCandidateAcknowledgementAttempt as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[0],
    );
    expect(
      logged.some(
        (entry: { reasonCode?: string | null }) =>
          entry.reasonCode === "invalid_source_attribution",
      ),
    ).toBe(true);
  });

  it("checks consent and logs no_consent suppression on agency path", async () => {
    const { buildCandidateAcknowledgementPlan } = await import("@/lib/acknowledgements/notifier");
    const { ConsentService } = await import("@/lib/services/ConsentService");
    const { sendWhatsAppMessage } = await import("@/lib/services/whatsapp");
    const { logCandidateAcknowledgementAttempt } = await import("@/lib/acknowledgements/log");

    (buildCandidateAcknowledgementPlan as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: true,
      channels: [
        { channel: "email", shouldAttempt: false, suppressionReasonCode: "no_consent" },
        { channel: "whatsapp", shouldAttempt: false, suppressionReasonCode: "no_consent" },
      ],
    });
    (ConsentService.hasRequiredConsent as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const { notifyCvIngestedFromAgencySingle } =
      await import("@/lib/acknowledgements/agency-single");
    await notifyCvIngestedFromAgencySingle({
      applicationId: "app-1",
      candidateId: "cand-1",
      candidateName: "Jane",
      candidatePhone: "+919999999999",
      jobId: "job-1",
      agencyName: "TalentBridge",
      companyName: "Acme",
    });

    expect(ConsentService.hasRequiredConsent).toHaveBeenCalledOnce();
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
    const logged = (logCandidateAcknowledgementAttempt as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[0],
    );
    expect(
      logged.some(
        (entry: { channel?: string; reasonCode?: string | null }) =>
          entry.channel === "whatsapp" && entry.reasonCode === "no_consent",
      ),
    ).toBe(true);
  });

  it("uses agency_shared_profile variant and sends attributed message", async () => {
    const { buildCandidateAcknowledgementPlan } = await import("@/lib/acknowledgements/notifier");
    const { ConsentService } = await import("@/lib/services/ConsentService");
    const { sendWhatsAppMessage } = await import("@/lib/services/whatsapp");
    const { hasSentAttemptWithinWindow } = await import("@/lib/acknowledgements/idempotency");

    (buildCandidateAcknowledgementPlan as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: true,
      channels: [
        { channel: "email", shouldAttempt: false, suppressionReasonCode: "no_consent" },
        { channel: "whatsapp", shouldAttempt: true },
      ],
    });
    (ConsentService.hasRequiredConsent as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (hasSentAttemptWithinWindow as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (sendWhatsAppMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      messageId: "wa_1",
    });

    const { notifyCvIngestedFromAgencySingle } =
      await import("@/lib/acknowledgements/agency-single");
    await notifyCvIngestedFromAgencySingle({
      applicationId: "app-1",
      candidateId: "cand-1",
      candidateName: "Jane Doe",
      candidatePhone: "+919999999999",
      jobId: "job-1",
      jobTitle: "Backend Engineer",
      agencyName: "TalentBridge",
      companyName: "Acme",
    });

    expect(sendWhatsAppMessage).toHaveBeenCalledOnce();
    const msg = (sendWhatsAppMessage as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(msg).toContain("TalentBridge");
    expect(msg).toContain("Acme");
    expect(msg).toContain("Backend Engineer");
  });
});
