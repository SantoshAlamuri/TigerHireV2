import { describe, expect, it } from "vitest";
import { extractMessageStatusUpdates } from "@/lib/whatsapp/parse-message-status-webhook";

function statusPayload(statuses: unknown[]): unknown {
  return {
    entry: [{ changes: [{ field: "messages", value: { statuses } }] }],
  };
}

describe("extractMessageStatusUpdates", () => {
  it("returns empty for template status payloads", () => {
    expect(
      extractMessageStatusUpdates({
        entry: [{ changes: [{ field: "message_template_status_update", value: {} }] }],
      }),
    ).toEqual([]);
  });

  it("extracts sent / delivered / read statuses", () => {
    const updates = extractMessageStatusUpdates(
      statusPayload([
        { id: "wamid.A", recipient_id: "919010255055", status: "sent", timestamp: "1700000000" },
        {
          id: "wamid.B",
          recipient_id: "919010255055",
          status: "delivered",
          timestamp: "1700000010",
        },
        { id: "wamid.C", recipient_id: "919010255055", status: "read", timestamp: "1700000020" },
      ]),
    );
    expect(updates).toHaveLength(3);
    expect(updates.map((u) => u.status)).toEqual(["sent", "delivered", "read"]);
    expect(updates[0]?.recipientPhone).toBe("919010255055");
  });

  it("extracts failed status with error code + message", () => {
    const updates = extractMessageStatusUpdates(
      statusPayload([
        {
          id: "wamid.X",
          recipient_id: "+91 98490 92255",
          status: "failed",
          timestamp: "1700000100",
          errors: [
            {
              code: 131026,
              title: "Message undeliverable",
              error_data: { details: "Receiver is incapable of receiving this message." },
            },
          ],
        },
      ]),
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      waMessageId: "wamid.X",
      recipientPhone: "919849092255",
      status: "failed",
      errorCode: 131026,
      errorTitle: "Message undeliverable",
      errorMessage: "Receiver is incapable of receiving this message.",
    });
  });

  it("ignores entries without statuses and unknown status strings", () => {
    expect(
      extractMessageStatusUpdates(
        statusPayload([
          { id: "wamid.A", recipient_id: "919010255055", status: "queued" },
          { id: "", recipient_id: "919010255055", status: "sent" },
          { id: "wamid.B", recipient_id: "", status: "sent" },
        ]),
      ),
    ).toEqual([]);
  });

  it("ignores non-messages fields", () => {
    expect(
      extractMessageStatusUpdates({
        entry: [
          {
            changes: [
              {
                field: "message_template_status_update",
                value: { statuses: [{ id: "x", recipient_id: "1", status: "sent" }] },
              },
            ],
          },
        ],
      }),
    ).toEqual([]);
  });
});
