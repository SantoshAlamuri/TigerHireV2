import { describe, it, expect } from "vitest";
import {
  deliveryFieldsFromRow,
  failedChannelsToRetry,
  hasCriticalDeliveryFailure,
  listFailedChannelLabels,
  nextDeliveryStatus,
} from "@/lib/interviews/delivery-status";

describe("interview delivery status helpers", () => {
  it("detects critical failures", () => {
    expect(
      hasCriticalDeliveryFailure({
        candidate_email_status: "sent",
        interviewer_email_status: "failed",
        candidate_whatsapp_status: "not_applicable",
        last_delivery_attempt_at: null,
      }),
    ).toBe(true);
    expect(
      hasCriticalDeliveryFailure({
        candidate_email_status: "sent",
        interviewer_email_status: "sent",
        candidate_whatsapp_status: "not_applicable",
        last_delivery_attempt_at: null,
      }),
    ).toBe(false);
  });

  it("lists failed channel labels for UI", () => {
    const labels = listFailedChannelLabels({
      candidate_email_status: "failed",
      interviewer_email_status: "failed",
      candidate_whatsapp_status: "sent",
      last_delivery_attempt_at: null,
    });
    expect(labels).toEqual(["candidate email", "interviewer ICS email"]);
  });

  it("maps retry keys from failed statuses", () => {
    expect(
      failedChannelsToRetry({
        candidate_email_status: "failed",
        interviewer_email_status: "sent",
        candidate_whatsapp_status: "failed",
        last_delivery_attempt_at: null,
      }),
    ).toEqual(["candidate_email", "candidate_whatsapp"]);
  });

  it("marks resent after successful retry", () => {
    expect(nextDeliveryStatus("failed", "sent")).toBe("resent");
    expect(nextDeliveryStatus(null, "sent")).toBe("sent");
    expect(nextDeliveryStatus(null, "not_applicable")).toBe("not_applicable");
  });

  it("reads row fields", () => {
    expect(
      deliveryFieldsFromRow({
        candidate_email_status: "sent",
        interviewer_email_status: null,
        candidate_whatsapp_status: "not_applicable",
        last_delivery_attempt_at: "2026-05-17T12:00:00Z",
      }),
    ).toEqual({
      candidate_email_status: "sent",
      interviewer_email_status: null,
      candidate_whatsapp_status: "not_applicable",
      last_delivery_attempt_at: "2026-05-17T12:00:00Z",
    });
  });
});
