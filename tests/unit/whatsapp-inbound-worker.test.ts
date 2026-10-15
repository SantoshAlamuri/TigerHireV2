import { beforeEach, describe, expect, it, vi } from "vitest";

const mockHandleInbound = vi.fn().mockResolvedValue(undefined);
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
}));
vi.mock("@/lib/whatsapp/handler", () => ({
  handleInboundMessage: (...args: unknown[]) => mockHandleInbound(...args),
}));
vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  handleWhatsappInboundJob,
  whatsappInboundConfig,
  WHATSAPP_INBOUND_EVENT,
} from "@/inngest/whatsapp-inbound";

// Fake Inngest step: runs the step body immediately (no memoization needed for
// these unit assertions).
const step = { run: <T>(_name: string, fn: () => Promise<T>) => fn() };

function makePayload(id = "wamid.worker-1") {
  return {
    messages: [{ from: "919000000009", id, type: "text", text: { body: "APPLY" } }],
  };
}

beforeEach(() => {
  mockHandleInbound.mockClear();
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: true, error: null });
});

describe("whatsappInboundConfig", () => {
  it("serializes per phone with a concurrency limit of 1", () => {
    expect(whatsappInboundConfig.concurrency).toEqual({
      key: "event.data.phone",
      limit: 1,
    });
    expect(whatsappInboundConfig.triggers).toEqual({ event: WHATSAPP_INBOUND_EVENT });
    expect(whatsappInboundConfig.retries).toBeGreaterThanOrEqual(1);
  });
});

describe("handleWhatsappInboundJob", () => {
  it("skips when the event carries no payload", async () => {
    const res = await handleWhatsappInboundJob({ event: { data: { phone: "9" } }, step });
    expect(res).toEqual({ skipped: true });
    expect(mockHandleInbound).not.toHaveBeenCalled();
  });

  it("claims idempotency then processes the message", async () => {
    const res = await handleWhatsappInboundJob({
      event: {
        data: { phone: "919000000009", messageId: "wamid.worker-1", payload: makePayload() },
      },
      step,
    });
    expect(mockRpc).toHaveBeenCalledWith("webhook_event_try_acquire", {
      p_provider: "whatsapp",
      p_event_id: "wamid.worker-1",
    });
    expect(mockHandleInbound).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ processed: true });
  });

  it("dedups (no processing) when the claim was already taken", async () => {
    mockRpc.mockResolvedValueOnce({ data: false, error: null });
    const res = await handleWhatsappInboundJob({
      event: {
        data: { phone: "919000000009", messageId: "wamid.dup", payload: makePayload("wamid.dup") },
      },
      step,
    });
    expect(res).toEqual({ deduped: true });
    expect(mockHandleInbound).not.toHaveBeenCalled();
  });

  it("throws on a claim error so Inngest retries (fail-closed)", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "db down" } });
    await expect(
      handleWhatsappInboundJob({
        event: {
          data: {
            phone: "919000000009",
            messageId: "wamid.err",
            payload: makePayload("wamid.err"),
          },
        },
        step,
      }),
    ).rejects.toThrow(/idempotency claim failed/);
    expect(mockHandleInbound).not.toHaveBeenCalled();
  });

  it("processes without a claim when messageId is absent", async () => {
    const res = await handleWhatsappInboundJob({
      event: { data: { phone: "919000000009", payload: makePayload() } },
      step,
    });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockHandleInbound).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ processed: true });
  });
});
