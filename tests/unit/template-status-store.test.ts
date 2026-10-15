import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  upsertTemplateStatusFromWebhook,
  upsertTemplateStatusFromApiSubmit,
} from "@/lib/whatsapp/template-status-store";

describe("template-status-store", () => {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const admin = {
    from: vi.fn(() => ({ upsert })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts webhook APPROVED events", async () => {
    await upsertTemplateStatusFromWebhook(
      admin as never,
      {
        event: "APPROVED",
        message_template_name: "th_screening_invite",
        message_template_language: "en",
        message_template_id: 123,
      },
      "waba-1",
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        template_name: "th_screening_invite",
        status: "APPROVED",
        waba_id: "waba-1",
      }),
      { onConflict: "template_name,language" },
    );
  });

  it("upserts API submit as PENDING", async () => {
    await upsertTemplateStatusFromApiSubmit(admin as never, {
      template_name: "th_screening_invite",
      language: "en",
      status: "PENDING",
      category: "UTILITY",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        template_name: "th_screening_invite",
        status: "PENDING",
        last_event: "API_SUBMIT",
      }),
      { onConflict: "template_name,language" },
    );
  });
});
