import { describe, expect, it } from "vitest";
import {
  extractInboundContextFromWhatsAppMessage,
  normalizeWhatsAppWebhookBody,
} from "@/lib/whatsapp/parse-webhook-payload";

const SAMPLE_UUID = "550e8400-e29b-41d4-a716-446655440000";
const SAMPLE_UUID_32 = "550e8400e29b41d4a716446655440000";

describe("normalizeWhatsAppWebhookBody", () => {
  it("normalizes Meta webhook body and extracts job_id from button payload (hyphenated UUID)", () => {
    const out = normalizeWhatsAppWebhookBody({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: "919876543210",
                    type: "button",
                    button: { payload: `job_id:${SAMPLE_UUID}` },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(out.messages).toHaveLength(1);
    expect(out.extracted?.job_id).toBe(SAMPLE_UUID);
  });

  it("normalizes 32-char hex job_id to hyphenated UUID", () => {
    const out = normalizeWhatsAppWebhookBody({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: "919876543210",
                    type: "interactive",
                    interactive: {
                      type: "button_reply",
                      button_reply: { id: `job_id:${SAMPLE_UUID_32}` },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(out.extracted?.job_id).toBe(SAMPLE_UUID);
  });

  it("extracts campaign_id and prefers Meta nested entry.changes.value shape", () => {
    const camp = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const out = normalizeWhatsAppWebhookBody({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: "919876543210",
                    type: "button",
                    button: { payload: `campaign_id:${camp}` },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(out.messages?.[0]?.from).toBe("919876543210");
    expect(out.extracted?.campaign_id).toBe(camp.toLowerCase());
  });

  it("falls back to context.id when button payload has no job_id", () => {
    const out = normalizeWhatsAppWebhookBody({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: "919876543210",
                    type: "button",
                    context: { id: `job_id:${SAMPLE_UUID}` },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(out.extracted?.job_id).toBe(SAMPLE_UUID);
  });

  it("returns empty object for non-object or empty payloads", () => {
    expect(normalizeWhatsAppWebhookBody(null)).toEqual({});
    expect(normalizeWhatsAppWebhookBody(undefined)).toEqual({});
    expect(normalizeWhatsAppWebhookBody({})).toEqual({});
    expect(
      normalizeWhatsAppWebhookBody({
        object: "whatsapp_business_account",
        entry: [{ changes: [{ value: {} }] }],
      }),
    ).toEqual({});
  });

  it("normalizes Meta document payload", () => {
    const out = normalizeWhatsAppWebhookBody({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: "919876543210",
                    type: "document",
                    document: {
                      id: "meta-media-id",
                      filename: "cv.pdf",
                      mime_type: "application/pdf",
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(out.messages).toHaveLength(1);
    expect(out.messages?.[0]?.from).toBe("919876543210");
    expect(out.messages?.[0]?.type).toBe("document");
    expect(out.messages?.[0]?.document?.id).toBe("meta-media-id");
  });

  it("extracts context from each message independently in batched webhook payloads", () => {
    const first = {
      from: "919876543210",
      type: "text",
      text: { body: "CV attached" },
    };
    const second = {
      from: "919876543210",
      type: "interactive",
      interactive: {
        type: "button_reply",
        button_reply: { id: `job_id:${SAMPLE_UUID}` },
      },
    };

    const out = normalizeWhatsAppWebhookBody({
      entry: [{ changes: [{ value: { messages: [first, second] } }] }],
    });

    expect(out.extracted?.job_id).toBeUndefined();
    expect(extractInboundContextFromWhatsAppMessage(out.messages![0]!)).toEqual({});
    expect(extractInboundContextFromWhatsAppMessage(out.messages![1]!).job_id).toBe(SAMPLE_UUID);
  });
});
