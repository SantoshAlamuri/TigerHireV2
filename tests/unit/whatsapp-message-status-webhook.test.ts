import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WhatsAppMessageStatusUpdate } from "@/lib/whatsapp/parse-message-status-webhook";

const mockSendWhatsAppMessage = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/lib/services/whatsapp", () => ({
  sendWhatsAppMessage: (...args: unknown[]) => mockSendWhatsAppMessage(...args),
}));

vi.mock("@/lib/marketing/public-whatsapp", () => ({
  getPublicWhatsAppChatUrl: () => "https://wa.me/919999999999?text=Hi",
}));

vi.mock("@/lib/referrers/normalize-whatsapp", () => ({
  normalizeReferrerWhatsapp: (s: string) => s.replace(/\D/g, ""),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/**
 * Query builder that is chainable on every method AND thenable, so that a select
 * chain terminating in `.maybeSingle()` resolves `selectResult`, while an
 * `.update({...}).eq(...)` chain (awaited directly) resolves `{ error: null }`.
 */
function makeBuilder(selectResult: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.gte = vi.fn(chain);
  builder.order = vi.fn(chain);
  builder.limit = vi.fn(chain);
  builder.update = vi.fn(chain);
  builder.maybeSingle = vi.fn(() => Promise.resolve(selectResult));
  builder.single = vi.fn(() => Promise.resolve(selectResult));
  builder.then = (resolve: (v: { error: null }) => unknown) => resolve({ error: null });
  return builder;
}

function makeUpdate(
  overrides: Partial<WhatsAppMessageStatusUpdate> = {},
): WhatsAppMessageStatusUpdate {
  return {
    waMessageId: "wamid.ABC",
    recipientPhone: "919812345678",
    status: "delivered",
    timestamp: "1700000000",
    errorCode: null,
    errorTitle: null,
    errorMessage: null,
    ...overrides,
  };
}

async function run(
  builders: Record<string, ReturnType<typeof makeBuilder>>,
  updates: WhatsAppMessageStatusUpdate[],
) {
  const from = vi.fn((table: string) => {
    const b = builders[table];
    if (!b) throw new Error(`unexpected table ${table}`);
    return b;
  });
  const supabase = { from } as never;
  const { handleMessageStatusWebhookUpdates } =
    await import("@/lib/whatsapp/handle-message-status-webhook");
  await handleMessageStatusWebhookUpdates(supabase, updates);
  return from;
}

describe("handleMessageStatusWebhookUpdates", () => {
  beforeEach(() => {
    mockSendWhatsAppMessage.mockReset();
    mockSendWhatsAppMessage.mockResolvedValue({ success: true });
  });

  it("advances the message log and referral to delivered", async () => {
    const log = makeBuilder({ data: { id: "log-1", delivery_status: null }, error: null });
    const referrals = makeBuilder({
      data: { id: "ref-1", referrer_id: null, last_outreach_delivery_status: null },
      error: null,
    });

    await run({ whatsapp_message_log: log, referrals }, [makeUpdate({ status: "delivered" })]);

    expect(log.update).toHaveBeenCalledWith(
      expect.objectContaining({ delivery_status: "delivered", delivery_error: null }),
    );
    expect(referrals.update).toHaveBeenCalledWith(
      expect.objectContaining({ last_outreach_delivery_status: "delivered" }),
    );
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("does not downgrade a delivered log when a late sent arrives", async () => {
    const log = makeBuilder({ data: { id: "log-1", delivery_status: "delivered" }, error: null });
    const referrals = makeBuilder({
      data: { id: "ref-1", referrer_id: null, last_outreach_delivery_status: "delivered" },
      error: null,
    });

    await run({ whatsapp_message_log: log, referrals }, [makeUpdate({ status: "sent" })]);

    expect(log.update).not.toHaveBeenCalled();
    expect(referrals.update).not.toHaveBeenCalled();
  });

  it("treats failed as terminal and refuses to overwrite it with a later read", async () => {
    const log = makeBuilder({ data: { id: "log-1", delivery_status: "failed" }, error: null });
    const referrals = makeBuilder({
      data: { id: "ref-1", referrer_id: null, last_outreach_delivery_status: "failed" },
      error: null,
    });

    await run({ whatsapp_message_log: log, referrals }, [makeUpdate({ status: "read" })]);

    expect(log.update).not.toHaveBeenCalled();
    expect(referrals.update).not.toHaveBeenCalled();
  });

  it("records the error and nudges the referrer to resend on a failed delivery", async () => {
    const log = makeBuilder({ data: { id: "log-1", delivery_status: null }, error: null });
    const referrals = makeBuilder({
      data: { id: "ref-1", referrer_id: "user-9", last_outreach_delivery_status: null },
      error: null,
    });
    const referrers = makeBuilder({ data: { whatsapp_number: "+91 98111 22222" }, error: null });

    await run({ whatsapp_message_log: log, referrals, referrers }, [
      makeUpdate({
        status: "failed",
        errorCode: 131026,
        errorTitle: "Message undeliverable",
      }),
    ]);

    expect(referrals.update).toHaveBeenCalledWith(
      expect.objectContaining({
        last_outreach_delivery_status: "failed",
        last_outreach_delivery_error: expect.stringContaining("131026"),
      }),
    );
    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(1);
    const [phone, body] = mockSendWhatsAppMessage.mock.calls[0];
    expect(phone).toBe("919811122222");
    expect(body).toMatch(/RESEND/);
    expect(body).toMatch(/could not deliver/i);
  });

  it("skips the log update when no row matches the wa_message_id", async () => {
    const log = makeBuilder({ data: null, error: null });
    const referrals = makeBuilder({ data: null, error: null });

    await run({ whatsapp_message_log: log, referrals }, [makeUpdate({ status: "delivered" })]);

    expect(log.update).not.toHaveBeenCalled();
    expect(referrals.update).not.toHaveBeenCalled();
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("does not notify the referrer on a failed delivery with no linked referrer", async () => {
    const log = makeBuilder({ data: { id: "log-1", delivery_status: null }, error: null });
    const referrals = makeBuilder({
      data: { id: "ref-1", referrer_id: null, last_outreach_delivery_status: null },
      error: null,
    });

    await run({ whatsapp_message_log: log, referrals }, [makeUpdate({ status: "failed" })]);

    expect(referrals.update).toHaveBeenCalledWith(
      expect.objectContaining({ last_outreach_delivery_status: "failed" }),
    );
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });
});
