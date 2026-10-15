import { describe, expect, it } from "vitest";
import { extractTemplateStatusUpdates } from "@/lib/whatsapp/parse-template-status-webhook";

describe("extractTemplateStatusUpdates", () => {
  it("returns empty for inbound message payloads", () => {
    expect(
      extractTemplateStatusUpdates({
        entry: [{ changes: [{ value: { messages: [{ from: "1" }] } }] }],
      }),
    ).toEqual([]);
  });

  it("extracts message_template_status_update events", () => {
    const events = extractTemplateStatusUpdates({
      entry: [
        {
          changes: [
            {
              field: "message_template_status_update",
              value: {
                event: "APPROVED",
                message_template_id: 926910283713404,
                message_template_name: "tigerhire_referred_candidate_v1",
                message_template_language: "en",
              },
            },
          ],
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: "APPROVED",
      message_template_name: "tigerhire_referred_candidate_v1",
    });
  });

  it("extracts rejection_reason on REJECTED", () => {
    const events = extractTemplateStatusUpdates({
      entry: [
        {
          changes: [
            {
              field: "message_template_status_update",
              value: {
                event: "REJECTED",
                message_template_name: "screening_questions_v6",
                rejection_reason: "INVALID_FORMAT",
              },
            },
          ],
        },
      ],
    });
    expect(events[0].rejection_reason).toBe("INVALID_FORMAT");
  });
});
