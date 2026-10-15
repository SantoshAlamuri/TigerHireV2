import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockQueryBuilder } from "../helpers";

vi.mock("@/lib/services/resend", () => ({
  sendApplicationConfirmation: vi.fn(),
}));

vi.mock("@/lib/services/whatsapp", () => ({
  sendApplicationReceivedTemplate: vi.fn(),
  sendWhatsAppMessage: vi.fn(),
}));

vi.mock("@/lib/acknowledgements/notifier", () => ({
  buildCandidateAcknowledgementPlan: vi.fn(),
}));

vi.mock("@/lib/acknowledgements/log", () => ({
  logCandidateAcknowledgementAttempt: vi.fn(),
}));

vi.mock("@/lib/acknowledgements/idempotency", () => ({
  hasSentAttemptWithinWindow: vi.fn(),
}));

describe("public apply acknowledgements", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("falls back to legacy WhatsApp nudge when centralized notifier is disabled", async () => {
    const { buildCandidateAcknowledgementPlan } = await import("@/lib/acknowledgements/notifier");
    const { sendWhatsAppMessage } = await import("@/lib/services/whatsapp");
    (buildCandidateAcknowledgementPlan as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: false,
      channels: [],
    });
    (sendWhatsAppMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    const supabase = {
      from: vi.fn(() => createMockQueryBuilder({ data: null })),
    };
    const { notifyCvIngestedFromPublicApply } = await import("@/lib/agents/public-apply");
    await notifyCvIngestedFromPublicApply(
      supabase as never,
      {
        phone: "+919999999999",
        email: "a@example.com",
        jobId: undefined,
        whatsappOptIn: true,
      },
      "cand-1",
      "Jane",
    );

    expect(sendWhatsAppMessage).toHaveBeenCalledOnce();
  });

  it("attempts enabled channels and logs outcomes when notifier is enabled", async () => {
    const { buildCandidateAcknowledgementPlan } = await import("@/lib/acknowledgements/notifier");
    const { sendApplicationConfirmation } = await import("@/lib/services/resend");
    const { sendApplicationReceivedTemplate } = await import("@/lib/services/whatsapp");
    const { logCandidateAcknowledgementAttempt } = await import("@/lib/acknowledgements/log");
    const { hasSentAttemptWithinWindow } = await import("@/lib/acknowledgements/idempotency");

    (buildCandidateAcknowledgementPlan as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: true,
      channels: [
        { channel: "email", shouldAttempt: true },
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

    const appBuilder = createMockQueryBuilder({ data: { id: "app-1" } });
    const jobBuilder = createMockQueryBuilder({
      data: { title: "Engineer", organisations: [{ name: "Acme" }] },
    });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "applications") return appBuilder;
        if (table === "jobs") return jobBuilder;
        return createMockQueryBuilder({ data: null });
      }),
    };
    const { notifyCvIngestedFromPublicApply } = await import("@/lib/agents/public-apply");
    await notifyCvIngestedFromPublicApply(
      supabase as never,
      {
        phone: "+919999999999",
        email: "a@example.com",
        jobId: "job-1",
        whatsappOptIn: true,
      },
      "cand-1",
      "Jane",
    );

    expect(sendApplicationConfirmation).toHaveBeenCalledOnce();
    expect(sendApplicationReceivedTemplate).toHaveBeenCalledOnce();
    expect(logCandidateAcknowledgementAttempt).toHaveBeenCalledTimes(2);
  });

  it("suppresses duplicate attempts on second call within dedupe window", async () => {
    const { buildCandidateAcknowledgementPlan } = await import("@/lib/acknowledgements/notifier");
    const { sendApplicationConfirmation } = await import("@/lib/services/resend");
    const { sendApplicationReceivedTemplate } = await import("@/lib/services/whatsapp");
    const { logCandidateAcknowledgementAttempt } = await import("@/lib/acknowledgements/log");
    const { hasSentAttemptWithinWindow } = await import("@/lib/acknowledgements/idempotency");

    (buildCandidateAcknowledgementPlan as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: true,
      channels: [
        { channel: "email", shouldAttempt: true },
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
    (hasSentAttemptWithinWindow as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);

    const appBuilder = createMockQueryBuilder({ data: { id: "app-1" } });
    const jobBuilder = createMockQueryBuilder({
      data: { title: "Engineer", organisations: [{ name: "Acme" }] },
    });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "applications") return appBuilder;
        if (table === "jobs") return jobBuilder;
        return createMockQueryBuilder({ data: null });
      }),
    };
    const { notifyCvIngestedFromPublicApply } = await import("@/lib/agents/public-apply");

    await notifyCvIngestedFromPublicApply(
      supabase as never,
      {
        phone: "+919999999999",
        email: "a@example.com",
        jobId: "job-1",
        whatsappOptIn: true,
      },
      "cand-1",
      "Jane",
    );
    await notifyCvIngestedFromPublicApply(
      supabase as never,
      {
        phone: "+919999999999",
        email: "a@example.com",
        jobId: "job-1",
        whatsappOptIn: true,
      },
      "cand-1",
      "Jane",
    );

    expect(sendApplicationConfirmation).toHaveBeenCalledTimes(1);
    expect(sendApplicationReceivedTemplate).toHaveBeenCalledTimes(1);
    const logged = (logCandidateAcknowledgementAttempt as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[0],
    );
    const duplicateLogs = logged.filter(
      (entry: { reasonCode?: string | null; outcome?: string }) =>
        entry.reasonCode === "duplicate" && entry.outcome === "suppressed_duplicate",
    );
    expect(duplicateLogs.length).toBe(2);
  });
});
