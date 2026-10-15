import { describe, it, expect } from "vitest";
import { signOutboundWebhookPayload } from "@/lib/webhooks/organisation-outbound-delivery";
import { createHmac } from "node:crypto";

describe("outbound webhook signature", () => {
  it("matches hmac of timestamp and body", () => {
    const secret = "a".repeat(32);
    const ts = "1234567890";
    const body = '{"event":"x","sent_at":"t","data":{}}';
    const v1 = signOutboundWebhookPayload(secret, ts, body);
    const expected = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
    expect(v1).toBe(expected);
  });
});
