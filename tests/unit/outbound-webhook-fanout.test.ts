import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDeliver = vi.fn();
const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
const hooksData = {
  data: [
    {
      id: "hook-1",
      target_url: "https://example.com/wh",
      signing_secret: "0".repeat(32),
      event_types: ["*"] as string[],
    },
  ],
  error: null,
};

const hooksSelect = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue(hooksData),
  }),
});

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "organisation_outbound_webhooks") {
        return { select: hooksSelect };
      }
      if (table === "outbound_webhook_deliveries") {
        return { insert: insertMock };
      }
      return { select: vi.fn() };
    },
  }),
}));

vi.mock("@/lib/webhooks/organisation-outbound-delivery", () => ({
  deliverOutboundWebhook: (input: unknown) => mockDeliver(input),
  signOutboundWebhookPayload: vi.fn(),
  generateOutboundWebhookSecret: vi.fn(),
  maskSecretTail: vi.fn(),
}));

import { runOrganisationOutboundWebhookFanout } from "@/lib/webhooks/fanout-organisation-outbound";

describe("runOrganisationOutboundWebhookFanout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeliver.mockResolvedValue({ ok: true, status: 200 });
  });

  it("delivers to matching hooks and records a delivery row", async () => {
    const r = await runOrganisationOutboundWebhookFanout({
      organisationId: "org-1",
      eventType: "application.submitted",
      data: { applicationId: "a1" },
    });
    expect(r.hooks).toBe(1);
    expect(r.sent).toBe(1);
    expect(r.failed).toBe(0);
    expect(mockDeliver).toHaveBeenCalledOnce();
    expect(mockDeliver.mock.calls[0][0].payload.data).toEqual({ applicationId: "a1" });
    expect(insertMock).toHaveBeenCalledOnce();
    const row = insertMock.mock.calls[0][0] as { delivery_status: string };
    expect(row.delivery_status).toBe("success");
  });

  it("increments failed and still logs when deliver returns not ok", async () => {
    mockDeliver.mockResolvedValue({ ok: false, error: "HTTP 500", status: 500 });
    const r = await runOrganisationOutboundWebhookFanout({
      organisationId: "org-1",
      eventType: "application.submitted",
      data: { applicationId: "a1" },
    });
    expect(r.sent).toBe(0);
    expect(r.failed).toBe(1);
    const row = insertMock.mock.calls[0][0] as { delivery_status: string };
    expect(row.delivery_status).toBe("failed");
  });
});
