import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAppendToDlq = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/utils/dlq", () => ({
  appendToDlq: (...args: unknown[]) => mockAppendToDlq(...args),
}));
vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { recordWhatsAppSendFailure } from "@/lib/services/whatsapp";

beforeEach(() => {
  mockAppendToDlq.mockClear();
});

describe("recordWhatsAppSendFailure", () => {
  it("appends a whatsapp_send DLQ row with routing fields, not message body", async () => {
    await recordWhatsAppSendFailure(
      {
        to: "919876543210",
        type: "template",
        template: { name: "th_shortlisted" },
        // A body-ish field that must NOT be parked in the DLQ.
        text: { body: "sensitive personal content" },
      },
      "HTTP 400: bad recipient",
      { applicationId: "app-1" },
      "http_4xx",
    );

    expect(mockAppendToDlq).toHaveBeenCalledTimes(1);
    const [opType, payload, error] = mockAppendToDlq.mock.calls[0] as [
      string,
      Record<string, unknown>,
      string,
    ];
    expect(opType).toBe("whatsapp_send");
    expect(payload).toMatchObject({
      to: "919876543210",
      to_digits_len: 12,
      type: "template",
      template: "th_shortlisted",
      application_id: "app-1",
      failure_class: "http_4xx",
    });
    expect(payload).not.toHaveProperty("text");
    expect(error).toBe("HTTP 400: bad recipient");
  });

  it("defaults failure_class and tolerates a missing template / applicationId", async () => {
    await recordWhatsAppSendFailure({ to: "919000000000", type: "text" }, "aborted");
    const [, payload] = mockAppendToDlq.mock.calls[0] as [string, Record<string, unknown>, string];
    expect(payload).toMatchObject({
      type: "text",
      template: null,
      application_id: null,
      failure_class: "send_failed",
    });
  });
});
