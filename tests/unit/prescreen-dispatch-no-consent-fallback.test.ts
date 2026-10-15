import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSendWhatsAppMessage = vi.fn();

vi.mock("@/lib/services/whatsapp", () => ({
  sendWhatsAppMessage: (...args: unknown[]) => mockSendWhatsAppMessage(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("dispatchPrescreenMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendWhatsAppMessage.mockResolvedValue({ success: true });
  });

  it("disables consent-template fallback so closed windows do not divert to the CV bot", async () => {
    const { dispatchPrescreenMessage } = await import("@/lib/prescreen/dispatch");
    await dispatchPrescreenMessage(
      { channel: "whatsapp", phone: "9199990001" },
      "Quick reminder about your Lead Business Analyst shortlist",
    );

    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "9199990001",
      "Quick reminder about your Lead Business Analyst shortlist",
      { allowConsentFallback: false },
    );
  });

  it("returns false when session text cannot be delivered", async () => {
    mockSendWhatsAppMessage.mockResolvedValue({
      success: false,
      error: "session_window_closed",
    });
    const { dispatchPrescreenMessage } = await import("@/lib/prescreen/dispatch");
    const ok = await dispatchPrescreenMessage(
      { channel: "whatsapp", phone: "9199990001" },
      "Next question",
    );
    expect(ok).toBe(false);
  });
});
