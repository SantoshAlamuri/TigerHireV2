import { describe, expect, it } from "vitest";
import { buildAckDedupeKey } from "@/lib/acknowledgements/dedupe";

describe("acknowledgements/dedupe", () => {
  it("uses application id when available", () => {
    const key = buildAckDedupeKey({
      applicationId: "app-1",
      candidateId: "cand-1",
      eventType: "cv_ingested",
      channel: "email",
      templateVariant: "direct_apply_received",
      occurredAt: new Date("2026-04-28T10:00:00.000Z"),
    });
    expect(key).toBe("app-1:cv_ingested:email:direct_apply_received:2026-04-28");
  });

  it("falls back to candidate id when application id is missing", () => {
    const key = buildAckDedupeKey({
      candidateId: "cand-1",
      eventType: "cv_ingested",
      channel: "whatsapp",
      occurredAt: new Date("2026-04-28T23:59:59.000Z"),
    });
    expect(key).toBe("cand-1:cv_ingested:whatsapp:default:2026-04-28");
  });
});
