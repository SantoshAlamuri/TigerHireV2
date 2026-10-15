import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  extractIntakeDocuments,
  extractJobIdFromCaption,
  isIntakeWebhookPayload,
  isResumeDocument,
} from "@/lib/whatsapp/intake-inbox";

const INTAKE_ID = "111222333444555";
const CANDIDATE_LINE_ID = "999888777666555";

function webhookBody(args: { phoneNumberId: string; messages?: unknown[] }): unknown {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-1",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { display_phone_number: "9199999", phone_number_id: args.phoneNumberId },
              messages: args.messages ?? [],
            },
          },
        ],
      },
    ],
  };
}

function documentMessage(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "wamid.abc123",
    from: "918888877777",
    type: "document",
    document: {
      id: "media-1",
      filename: "Priya_Sharma_CV.pdf",
      mime_type: "application/pdf",
      caption: "Apna forward — Backend Engineer",
    },
    ...overrides,
  };
}

describe("isResumeDocument", () => {
  it("accepts pdf/doc/docx by mime or extension and rejects others", () => {
    expect(isResumeDocument({ mime_type: "application/pdf" })).toBe(true);
    expect(isResumeDocument({ filename: "cv.docx" })).toBe(true);
    expect(isResumeDocument({ filename: "CV.PDF" })).toBe(true);
    expect(isResumeDocument({ mime_type: "image/png", filename: "photo.png" })).toBe(false);
    expect(isResumeDocument({})).toBe(false);
  });
});

describe("extractIntakeDocuments", () => {
  it("collects resume documents addressed to the intake number only", () => {
    const body = webhookBody({ phoneNumberId: INTAKE_ID, messages: [documentMessage()] });
    const docs = extractIntakeDocuments(body, INTAKE_ID);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      wa_message_id: "wamid.abc123",
      sender_phone: "918888877777",
      media_id: "media-1",
      filename: "Priya_Sharma_CV.pdf",
      caption: "Apna forward — Backend Engineer",
    });
  });

  it("ignores messages on the candidate line even when they carry documents", () => {
    const body = webhookBody({ phoneNumberId: CANDIDATE_LINE_ID, messages: [documentMessage()] });
    expect(extractIntakeDocuments(body, INTAKE_ID)).toHaveLength(0);
  });

  it("skips text messages and non-resume documents on the intake number", () => {
    const body = webhookBody({
      phoneNumberId: INTAKE_ID,
      messages: [
        { id: "wamid.t1", from: "9188", type: "text", text: { body: "hello" } },
        documentMessage({
          id: "wamid.img",
          document: { id: "media-2", filename: "photo.png", mime_type: "image/png" },
        }),
      ],
    });
    expect(extractIntakeDocuments(body, INTAKE_ID)).toHaveLength(0);
  });

  it("returns nothing when the intake number id is unset", () => {
    const body = webhookBody({ phoneNumberId: INTAKE_ID, messages: [documentMessage()] });
    expect(extractIntakeDocuments(body, "")).toHaveLength(0);
  });
});

describe("isIntakeWebhookPayload", () => {
  beforeEach(() => {
    process.env.WHATSAPP_INTAKE_PHONE_NUMBER_ID = INTAKE_ID;
  });
  afterEach(() => {
    delete process.env.WHATSAPP_INTAKE_PHONE_NUMBER_ID;
  });

  it("is true only for messages on the configured intake number", () => {
    expect(
      isIntakeWebhookPayload(
        webhookBody({ phoneNumberId: INTAKE_ID, messages: [documentMessage()] }),
      ),
    ).toBe(true);
    expect(
      isIntakeWebhookPayload(
        webhookBody({ phoneNumberId: CANDIDATE_LINE_ID, messages: [documentMessage()] }),
      ),
    ).toBe(false);
  });

  it("is false for status-only webhooks on the intake number (no messages)", () => {
    expect(isIntakeWebhookPayload(webhookBody({ phoneNumberId: INTAKE_ID }))).toBe(false);
  });

  it("is false when the intake number is not provisioned", () => {
    delete process.env.WHATSAPP_INTAKE_PHONE_NUMBER_ID;
    expect(
      isIntakeWebhookPayload(
        webhookBody({ phoneNumberId: INTAKE_ID, messages: [documentMessage()] }),
      ),
    ).toBe(false);
  });
});

describe("extractJobIdFromCaption", () => {
  it("pulls a job uuid out of free text and lowercases it", () => {
    expect(
      extractJobIdFromCaption("Backend Engineer 1A2B3C4D-0000-4111-8222-333344445555 via Apna"),
    ).toBe("1a2b3c4d-0000-4111-8222-333344445555");
  });

  it("returns null when no uuid is present", () => {
    expect(extractJobIdFromCaption("Backend Engineer — Apna forward")).toBeNull();
    expect(extractJobIdFromCaption("")).toBeNull();
  });
});
