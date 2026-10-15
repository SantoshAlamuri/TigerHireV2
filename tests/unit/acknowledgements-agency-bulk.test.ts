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

vi.mock("@/lib/services/whatsapp", () => ({
  sendWhatsAppMessage: vi.fn(),
}));

vi.mock("@/lib/acknowledgements/log", () => ({
  logCandidateAcknowledgementAttempt: vi.fn(),
}));

vi.mock("@/lib/acknowledgements/idempotency", () => ({
  hasSentAttemptWithinWindow: vi.fn(),
}));

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: vi.fn(),
}));

describe("acknowledgements/agency-bulk", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockCreateSupabaseAdmin.mockReturnValue(createMockSupabase());
  });

  it("stays silent when notifier is disabled", async () => {
    const { buildCandidateAcknowledgementPlan } = await import("@/lib/acknowledgements/notifier");
    const { ConsentService } = await import("@/lib/services/ConsentService");
    const { sendWhatsAppMessage } = await import("@/lib/services/whatsapp");
    const { logCandidateAcknowledgementAttempt } = await import("@/lib/acknowledgements/log");
    const { isEnabled } = await import("@/lib/feature-flags");
    (buildCandidateAcknowledgementPlan as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: false,
      channels: [
        {
          channel: "email",
          shouldAttempt: false,
          suppressionReasonCode: "ingestion_path_disabled",
        },
        {
          channel: "whatsapp",
          shouldAttempt: false,
          suppressionReasonCode: "ingestion_path_disabled",
        },
      ],
    });
    (ConsentService.hasRequiredConsent as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (isEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const { notifyCvIngestedFromAgencyBulk } = await import("@/lib/acknowledgements/agency-bulk");
    await notifyCvIngestedFromAgencyBulk({
      candidateId: "cand-1",
      candidateName: "Jane",
      candidatePhone: "+919999999999",
      agencyName: "TalentBridge",
      companyName: "Acme",
    });

    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
    const rows = (logCandidateAcknowledgementAttempt as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[0],
    );
    expect(rows).toHaveLength(2);
    expect(
      rows.every(
        (r: { reasonCode?: string; outcome?: string }) =>
          r.reasonCode === "ingestion_path_disabled" && r.outcome === "suppressed_policy",
      ),
    ).toBe(true);
  });

  it("suppresses malformed agency name and logs explicit reason", async () => {
    const { buildCandidateAcknowledgementPlan } = await import("@/lib/acknowledgements/notifier");
    const { ConsentService } = await import("@/lib/services/ConsentService");
    const { sendWhatsAppMessage } = await import("@/lib/services/whatsapp");
    const { logCandidateAcknowledgementAttempt } = await import("@/lib/acknowledgements/log");
    const { hasSentAttemptWithinWindow } = await import("@/lib/acknowledgements/idempotency");
    const { isEnabled } = await import("@/lib/feature-flags");
    (buildCandidateAcknowledgementPlan as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: true,
      channels: [
        { channel: "email", shouldAttempt: false },
        { channel: "whatsapp", shouldAttempt: true },
      ],
    });
    (ConsentService.hasRequiredConsent as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (hasSentAttemptWithinWindow as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (isEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const { notifyCvIngestedFromAgencyBulk } = await import("@/lib/acknowledgements/agency-bulk");
    await notifyCvIngestedFromAgencyBulk({
      candidateId: "cand-1",
      candidateName: "Jane",
      candidatePhone: "+919999999999",
      agencyName: "Agency",
      companyName: "Acme",
    });

    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
    const rows = (logCandidateAcknowledgementAttempt as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[0],
    );
    expect(
      rows.some((r: { reasonCode?: string }) => r.reasonCode === "invalid_source_attribution"),
    ).toBe(true);
  });

  it("re-checks path flag before send and suppresses when flipped off", async () => {
    const { buildCandidateAcknowledgementPlan } = await import("@/lib/acknowledgements/notifier");
    const { ConsentService } = await import("@/lib/services/ConsentService");
    const { sendWhatsAppMessage } = await import("@/lib/services/whatsapp");
    const { logCandidateAcknowledgementAttempt } = await import("@/lib/acknowledgements/log");
    const { hasSentAttemptWithinWindow } = await import("@/lib/acknowledgements/idempotency");
    const { isEnabled } = await import("@/lib/feature-flags");
    (buildCandidateAcknowledgementPlan as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: true,
      channels: [
        { channel: "email", shouldAttempt: false },
        { channel: "whatsapp", shouldAttempt: true },
      ],
    });
    (ConsentService.hasRequiredConsent as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (hasSentAttemptWithinWindow as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (isEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const { notifyCvIngestedFromAgencyBulk } = await import("@/lib/acknowledgements/agency-bulk");
    await notifyCvIngestedFromAgencyBulk({
      candidateId: "cand-2",
      candidateName: "Jane",
      candidatePhone: "+919888888888",
      agencyName: "TalentBridge",
      companyName: "Acme",
    });

    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
    const rows = (logCandidateAcknowledgementAttempt as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[0],
    );
    expect(
      rows.some((r: { reasonCode?: string }) => r.reasonCode === "ingestion_path_disabled"),
    ).toBe(true);
  });
});
