import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockQueryBuilder } from "../helpers";

const mockRecordHiringOfferAuditEvent = vi.fn().mockResolvedValue(undefined);
const mockFrom = vi.fn();
const mockRetrieveSecret = vi.fn();
const mockDecryptIntegrationToken = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: mockFrom }),
}));

vi.mock("@/lib/services/secrets", () => ({
  retrieveSecret: (...args: unknown[]) => mockRetrieveSecret(...args),
  decryptIntegrationToken: (...args: unknown[]) => mockDecryptIntegrationToken(...args),
  encryptIntegrationToken: vi.fn(),
  storeSecret: vi.fn(),
  deleteSecret: vi.fn(),
}));

vi.mock("@/lib/audit/hiring-offer-audit", () => ({
  recordHiringOfferAuditEvent: (...args: unknown[]) => mockRecordHiringOfferAuditEvent(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("POST /api/webhooks/springverify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SPRINGVERIFY_WEBHOOK_SECRET;
  });

  it("returns 501 when webhook secret is missing", async () => {
    const { POST } = await import("@/app/api/webhooks/springverify/route");
    const req = new Request("http://localhost/api/webhooks/springverify", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(501);
  });

  it("returns 401 when webhook secret does not match", async () => {
    process.env.SPRINGVERIFY_WEBHOOK_SECRET = "expected-secret";
    const { POST } = await import("@/app/api/webhooks/springverify/route");
    const req = new Request("http://localhost/api/webhooks/springverify", {
      method: "POST",
      headers: { "x-tigerhire-webhook-secret": "wrong-secret" },
      body: "{}",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it("correlates payload to application and writes audit row", async () => {
    process.env.SPRINGVERIFY_WEBHOOK_SECRET = "expected-secret";
    mockFrom.mockImplementation((table: string) => {
      if (table === "applications") {
        return createMockQueryBuilder({
          data: {
            id: "00000000-0000-4000-8000-000000000111",
            jobs: { organisation_id: "org-1" },
          },
        });
      }
      if (table === "offers") {
        return createMockQueryBuilder({ data: { id: "offer-1" } });
      }
      return createMockQueryBuilder();
    });

    const payload = {
      external_id: "tigerhire:application:00000000-0000-4000-8000-000000000111",
      status: "in_progress",
    };
    const { POST } = await import("@/app/api/webhooks/springverify/route");
    const req = new Request("http://localhost/api/webhooks/springverify", {
      method: "POST",
      headers: {
        "x-tigerhire-webhook-secret": "expected-secret",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.applicationId).toBe("00000000-0000-4000-8000-000000000111");
    expect(mockRecordHiringOfferAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organisationId: "org-1",
        entityId: "offer-1",
        eventType: "BGV_WEBHOOK_RECEIVED",
        newStatus: "in_progress",
      }),
    );
  });

  function mockOrgWithSpringVerifyConnection() {
    mockFrom.mockImplementation((table: string) => {
      if (table === "applications") {
        return createMockQueryBuilder({
          data: {
            id: "00000000-0000-4000-8000-000000000111",
            jobs: { organisation_id: "org-1" },
          },
        });
      }
      if (table === "offers") {
        return createMockQueryBuilder({ data: { id: "offer-1" } });
      }
      if (table === "integration_connections") {
        return createMockQueryBuilder({
          data: {
            id: "conn-1",
            scope: "organisation",
            organisation_id: "org-1",
            provider: "springverify",
            status: "connected",
            secret_ref: "vault-ref-1",
            config: {
              create_case_url: "https://api-sa.in.springverify.com/external/v1/candidate/add",
              webhook_secret_enc: "enc:org-webhook",
            },
          },
        });
      }
      return createMockQueryBuilder();
    });
    mockRetrieveSecret.mockResolvedValue("org-api-token");
    mockDecryptIntegrationToken.mockReturnValue("org-webhook-secret");
  }

  const orgPayload = JSON.stringify({
    external_id: "tigerhire:application:00000000-0000-4000-8000-000000000111",
    status: "completed",
  });

  it("accepts the owning organisation's webhook secret (BYO account, no env secret)", async () => {
    mockOrgWithSpringVerifyConnection();

    const { POST } = await import("@/app/api/webhooks/springverify/route");
    const req = new Request("http://localhost/api/webhooks/springverify", {
      method: "POST",
      headers: {
        "x-tigerhire-webhook-secret": "org-webhook-secret",
        "content-type": "application/json",
      },
      body: orgPayload,
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(mockRecordHiringOfferAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ organisationId: "org-1", eventType: "BGV_WEBHOOK_RECEIVED" }),
    );
  });

  it("rejects a secret that matches neither the org secret nor the env secret", async () => {
    process.env.SPRINGVERIFY_WEBHOOK_SECRET = "env-secret";
    mockOrgWithSpringVerifyConnection();

    const { POST } = await import("@/app/api/webhooks/springverify/route");
    const req = new Request("http://localhost/api/webhooks/springverify", {
      method: "POST",
      headers: {
        "x-tigerhire-webhook-secret": "some-other-orgs-secret",
        "content-type": "application/json",
      },
      body: orgPayload,
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
    expect(mockRecordHiringOfferAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects the platform env secret when the org has its own secret (no cross-secret fallback)", async () => {
    process.env.SPRINGVERIFY_WEBHOOK_SECRET = "env-secret";
    mockOrgWithSpringVerifyConnection();

    const { POST } = await import("@/app/api/webhooks/springverify/route");
    const req = new Request("http://localhost/api/webhooks/springverify", {
      method: "POST",
      headers: { "x-tigerhire-webhook-secret": "env-secret", "content-type": "application/json" },
      body: orgPayload,
    });
    const res = await POST(req as never);
    // The org has its own webhook secret, so the platform-wide env secret must
    // not authorize events attributed to that org.
    expect(res.status).toBe(401);
  });
});
