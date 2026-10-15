import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockHandleInboundMessage = vi.fn().mockResolvedValue(undefined);
const mockSendTypingIndicator = vi.fn().mockResolvedValue(undefined);
const mockCheckRateLimit = vi.fn().mockResolvedValue({ allowed: true });
// Idempotency is enforced via a DB claim: admin.rpc("webhook_event_try_acquire").
// Returns { data: true } (first delivery → process) by default; tests override to
// { data: false } to exercise the duplicate path.
const mockRpc = vi.fn().mockResolvedValue({ data: true, error: null });
const mockUpsertTemplateStatus = vi.fn().mockResolvedValue(undefined);
const mockEnqueue = vi.fn().mockResolvedValue({ id: "evt-1" });

vi.mock("@/lib/whatsapp/handler", () => ({
  handleInboundMessage: (...args: unknown[]) => mockHandleInboundMessage(...args),
}));

vi.mock("@/lib/services/whatsapp", () => ({
  sendTypingIndicator: (...args: unknown[]) => mockSendTypingIndicator(...args),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/whatsapp/template-status-store", () => ({
  upsertTemplateStatusFromWebhook: (...args: unknown[]) => mockUpsertTemplateStatus(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => ({ rpc: (...args: unknown[]) => mockRpc(...args) })),
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    /** Run deferred work in tests so `handleInboundMessage` assertions are deterministic. */
    after: (fn: () => void | Promise<void>) => {
      const out = fn();
      return out && typeof (out as Promise<void>).then === "function"
        ? (out as Promise<void>)
        : Promise.resolve();
    },
  };
});

function signBody(secret: string, raw: string): string {
  return `sha256=${createHmac("sha256", secret).update(raw, "utf8").digest("hex")}`;
}

function metaTextMessageBody(overrides: { id?: string; from?: string; text?: string } = {}) {
  const id = overrides.id ?? "wamid.unit-test-001";
  const from = overrides.from ?? "15551234567";
  const text = overrides.text ?? "APPLY";
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from,
                  id,
                  type: "text",
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe("/api/webhooks/whatsapp", () => {
  beforeEach(() => {
    mockHandleInboundMessage.mockReset();
    mockSendTypingIndicator.mockReset();
    mockCheckRateLimit.mockReset();
    mockRpc.mockReset();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockRpc.mockResolvedValue({ data: true, error: null });
    mockEnqueue.mockReset();
    mockEnqueue.mockResolvedValue({ id: "evt-1" });
    delete process.env.WHATSAPP_DURABLE_INBOUND;
    process.env.WHATSAPP_META_APP_SECRET = "unit-test-app-secret";
    process.env.WHATSAPP_WEBHOOK_SECRET = "unit-test-verify-token";
  });

  describe("GET verification", () => {
    it("returns hub.challenge when verify_token matches", async () => {
      const { GET } = await import("@/app/api/webhooks/whatsapp/route");
      const url = new URL("http://localhost:3000/api/webhooks/whatsapp");
      url.searchParams.set("hub.mode", "subscribe");
      url.searchParams.set("hub.verify_token", "unit-test-verify-token");
      url.searchParams.set("hub.challenge", "999888777");
      const req = new NextRequest(url);
      const res = await GET(req);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("999888777");
    });

    it("returns 403 when verify_token does not match", async () => {
      const { GET } = await import("@/app/api/webhooks/whatsapp/route");
      const url = new URL("http://localhost:3000/api/webhooks/whatsapp");
      url.searchParams.set("hub.mode", "subscribe");
      url.searchParams.set("hub.verify_token", "wrong");
      url.searchParams.set("hub.challenge", "x");
      const req = new NextRequest(url);
      const res = await GET(req);
      expect(res.status).toBe(403);
    });
  });

  describe("POST", () => {
    it("returns 401 when x-hub-signature-256 is missing or invalid", async () => {
      const { POST } = await import("@/app/api/webhooks/whatsapp/route");
      const raw = JSON.stringify(metaTextMessageBody());
      const req = new NextRequest("http://localhost:3000/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": "sha256=deadbeef" },
        body: raw,
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
      expect(mockHandleInboundMessage).not.toHaveBeenCalled();
    });

    it("returns 400 when JSON is invalid", async () => {
      const { POST } = await import("@/app/api/webhooks/whatsapp/route");
      const raw = "{ not-json";
      const req = new NextRequest("http://localhost:3000/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": signBody("unit-test-app-secret", raw) },
        body: raw,
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      expect(mockHandleInboundMessage).not.toHaveBeenCalled();
    });

    it("returns 200 and invokes handleInboundMessage when signature is valid", async () => {
      const { POST } = await import("@/app/api/webhooks/whatsapp/route");
      const body = metaTextMessageBody({ id: "wamid.e2e-abc", from: "919876543210" });
      const raw = JSON.stringify(body);
      const req = new NextRequest("http://localhost:3000/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": signBody("unit-test-app-secret", raw) },
        body: raw,
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { status?: string };
      expect(json.status).toBe("received");
      expect(mockHandleInboundMessage).toHaveBeenCalledTimes(1);
      expect(mockSendTypingIndicator).toHaveBeenCalledWith("wamid.e2e-abc");
      expect(mockSendTypingIndicator.mock.invocationCallOrder[0]).toBeLessThan(
        mockHandleInboundMessage.mock.invocationCallOrder[0],
      );
      const payload = mockHandleInboundMessage.mock.calls[0][0] as {
        messages?: Array<{ from?: string; id?: string }>;
      };
      expect(payload.messages?.[0]?.from).toBe("919876543210");
      expect(payload.messages?.[0]?.id).toBe("wamid.e2e-abc");
    });

    it("skips typing indicator when inbound message has no from (system-style payload)", async () => {
      const { POST } = await import("@/app/api/webhooks/whatsapp/route");
      const body = metaTextMessageBody({ id: "wamid.no-from", from: "" });
      const raw = JSON.stringify(body);
      const req = new NextRequest("http://localhost:3000/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": signBody("unit-test-app-secret", raw) },
        body: raw,
      });
      await POST(req);
      expect(mockSendTypingIndicator).not.toHaveBeenCalled();
      expect(mockHandleInboundMessage).toHaveBeenCalledTimes(1);
    });

    it("claims the event via webhook_event_try_acquire when message id is present", async () => {
      const { POST } = await import("@/app/api/webhooks/whatsapp/route");
      const body = metaTextMessageBody({ id: "wamid.idem-wrap" });
      const raw = JSON.stringify(body);
      const req = new NextRequest("http://localhost:3000/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": signBody("unit-test-app-secret", raw) },
        body: raw,
      });
      await POST(req);
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith("webhook_event_try_acquire", {
        p_provider: "whatsapp",
        p_event_id: "wamid.idem-wrap",
      });
      expect(mockHandleInboundMessage).toHaveBeenCalledTimes(1);
    });

    it("skips processing when the event was already claimed (duplicate)", async () => {
      mockRpc.mockResolvedValueOnce({ data: false, error: null });
      const { POST } = await import("@/app/api/webhooks/whatsapp/route");
      const body = metaTextMessageBody({ id: "wamid.duplicate" });
      const raw = JSON.stringify(body);
      const req = new NextRequest("http://localhost:3000/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": signBody("unit-test-app-secret", raw) },
        body: raw,
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockHandleInboundMessage).not.toHaveBeenCalled();
    });

    it("does not claim an event when message id is absent", async () => {
      const { POST } = await import("@/app/api/webhooks/whatsapp/route");
      const body = metaTextMessageBody();
      delete (body.entry[0].changes[0].value.messages[0] as { id?: string }).id;
      const raw = JSON.stringify(body);
      const req = new NextRequest("http://localhost:3000/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": signBody("unit-test-app-secret", raw) },
        body: raw,
      });
      await POST(req);
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockHandleInboundMessage).toHaveBeenCalled();
    });

    it("persists template status updates and skips inbound handler", async () => {
      const { POST } = await import("@/app/api/webhooks/whatsapp/route");
      const body = {
        entry: [
          {
            changes: [
              {
                field: "message_template_status_update",
                value: {
                  event: "APPROVED",
                  message_template_name: "th_screening_invite",
                  message_template_language: "en",
                  message_template_id: 999,
                },
              },
            ],
          },
        ],
      };
      const raw = JSON.stringify(body);
      const req = new NextRequest("http://localhost:3000/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": signBody("unit-test-app-secret", raw) },
        body: raw,
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockUpsertTemplateStatus).toHaveBeenCalledTimes(1);
      expect(mockHandleInboundMessage).not.toHaveBeenCalled();
    });

    it("returns 200 without calling handleInboundMessage when rate limit exceeded", async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false });
      const { POST } = await import("@/app/api/webhooks/whatsapp/route");
      const body = metaTextMessageBody();
      const raw = JSON.stringify(body);
      const req = new NextRequest("http://localhost:3000/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": signBody("unit-test-app-secret", raw) },
        body: raw,
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockHandleInboundMessage).not.toHaveBeenCalled();
      expect(mockSendTypingIndicator).not.toHaveBeenCalled();
    });

    it("processes every message in a batched payload, not just messages[0]", async () => {
      const { POST } = await import("@/app/api/webhooks/whatsapp/route");
      const body = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: "919999999999",
                      id: "wamid.batch-1",
                      type: "text",
                      text: { body: "hi" },
                    },
                    {
                      from: "919999999999",
                      id: "wamid.batch-2",
                      type: "text",
                      text: { body: "APPLY" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const raw = JSON.stringify(body);
      const req = new NextRequest("http://localhost:3000/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": signBody("unit-test-app-secret", raw) },
        body: raw,
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockRpc).toHaveBeenCalledTimes(2);
      expect(mockHandleInboundMessage).toHaveBeenCalledTimes(2);
      const ids = mockHandleInboundMessage.mock.calls.map(
        (c) => (c[0] as { messages: Array<{ id: string }> }).messages[0].id,
      );
      expect(ids).toEqual(["wamid.batch-1", "wamid.batch-2"]);
    });

    it("fails closed with 503 when the idempotency claim errors (no processing)", async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: "db down" } });
      const { POST } = await import("@/app/api/webhooks/whatsapp/route");
      const body = metaTextMessageBody({ id: "wamid.claim-err" });
      const raw = JSON.stringify(body);
      const req = new NextRequest("http://localhost:3000/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": signBody("unit-test-app-secret", raw) },
        body: raw,
      });
      const res = await POST(req);
      expect(res.status).toBe(503);
      expect(mockHandleInboundMessage).not.toHaveBeenCalled();
    });

    it("dispatches already-claimed siblings but returns 503 when a later claim errors", async () => {
      mockRpc
        .mockResolvedValueOnce({ data: true, error: null })
        .mockResolvedValueOnce({ data: null, error: { message: "hiccup" } });
      const { POST } = await import("@/app/api/webhooks/whatsapp/route");
      const body = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    { from: "918888888888", id: "wamid.ok-1", type: "text", text: { body: "hi" } },
                    {
                      from: "918888888888",
                      id: "wamid.err-2",
                      type: "text",
                      text: { body: "APPLY" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const raw = JSON.stringify(body);
      const req = new NextRequest("http://localhost:3000/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": signBody("unit-test-app-secret", raw) },
        body: raw,
      });
      const res = await POST(req);
      expect(res.status).toBe(503);
      expect(mockHandleInboundMessage).toHaveBeenCalledTimes(1);
      expect(
        (mockHandleInboundMessage.mock.calls[0][0] as { messages: Array<{ id: string }> })
          .messages[0].id,
      ).toBe("wamid.ok-1");
    });

    it("durable mode: enqueues each message and does not process inline", async () => {
      process.env.WHATSAPP_DURABLE_INBOUND = "true";
      const { POST } = await import("@/app/api/webhooks/whatsapp/route");
      const body = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    { from: "917000000001", id: "wamid.d-1", type: "text", text: { body: "hi" } },
                    {
                      from: "917000000001",
                      id: "wamid.d-2",
                      type: "text",
                      text: { body: "APPLY" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const raw = JSON.stringify(body);
      const req = new NextRequest("http://localhost:3000/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": signBody("unit-test-app-secret", raw) },
        body: raw,
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockEnqueue).toHaveBeenCalledTimes(2);
      expect(mockEnqueue).toHaveBeenCalledWith(
        "whatsapp-inbound",
        expect.objectContaining({ phone: "917000000001", messageId: "wamid.d-1" }),
        { id: "wa-inbound:wamid.d-1" },
      );
      // Worker owns claim + processing; the webhook does neither.
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockHandleInboundMessage).not.toHaveBeenCalled();
    });

    it("durable mode: falls back to inline when enqueue is a no-op (no id)", async () => {
      process.env.WHATSAPP_DURABLE_INBOUND = "true";
      mockEnqueue.mockResolvedValue({}); // INNGEST_EVENT_KEY unset → enqueue no-ops
      const { POST } = await import("@/app/api/webhooks/whatsapp/route");
      const body = metaTextMessageBody({ id: "wamid.fallback", from: "917000000002" });
      const raw = JSON.stringify(body);
      const req = new NextRequest("http://localhost:3000/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": signBody("unit-test-app-secret", raw) },
        body: raw,
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
      // Fell back to the inline path: claimed and processed.
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockHandleInboundMessage).toHaveBeenCalledTimes(1);
    });
  });
});
