import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockQueryBuilder } from "../helpers";

const mockInitiateSpringVerifyCase = vi.fn();
const mockRecordHiringOfferAuditEvent = vi.fn().mockResolvedValue(undefined);
const mockFrom = vi.fn();

vi.mock("@/lib/integrations/springverify/client", () => ({
  initiateSpringVerifyCase: (...args: unknown[]) => mockInitiateSpringVerifyCase(...args),
}));

vi.mock("@/lib/audit/hiring-offer-audit", () => ({
  recordHiringOfferAuditEvent: (...args: unknown[]) => mockRecordHiringOfferAuditEvent(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: mockFrom }),
}));

const mockRetrieveSecret = vi.fn();
const mockDecryptIntegrationToken = vi.fn();

vi.mock("@/lib/services/secrets", () => ({
  retrieveSecret: (...args: unknown[]) => mockRetrieveSecret(...args),
  decryptIntegrationToken: (...args: unknown[]) => mockDecryptIntegrationToken(...args),
  encryptIntegrationToken: vi.fn(),
  storeSecret: vi.fn(),
  deleteSecret: vi.fn(),
}));

describe("springverify workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies missing env config as not_configured", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "applications") {
        return createMockQueryBuilder({
          data: {
            id: "00000000-0000-4000-8000-000000000001",
            candidate_id: "cand-1",
            jobs: { organisation_id: "org-1" },
          },
        });
      }
      if (table === "candidates") {
        return createMockQueryBuilder({
          data: { email: "cand@test.com", full_name: "Candidate A", phone: null },
        });
      }
      if (table === "offers") {
        return createMockQueryBuilder({ data: { id: "offer-1" } });
      }
      return createMockQueryBuilder();
    });
    mockInitiateSpringVerifyCase.mockResolvedValue({
      ok: false,
      error:
        "SpringVerify is not configured. Set SPRINGVERIFY_CREATE_CASE_URL and SPRINGVERIFY_API_KEY",
    });

    const { initiateSpringVerifyForApplication } =
      await import("@/lib/integrations/springverify/workflow");

    const result = await initiateSpringVerifyForApplication({
      applicationId: "00000000-0000-4000-8000-000000000001",
      initiatedBy: "user-1",
      expectedOrganisationId: "org-1",
      source: "offer_accept",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected failure");
    expect(result.code).toBe("not_configured");
    expect(result.status).toBe(400);
    // Customer-facing audit trail gets a clean informational skip event,
    // never a failure event carrying internal env-var setup instructions.
    expect(mockRecordHiringOfferAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "BGV_SKIPPED_NOT_CONFIGURED",
        entityId: "offer-1",
        metadata: { applicationId: "00000000-0000-4000-8000-000000000001" },
      }),
    );
    expect(mockRecordHiringOfferAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "BGV_INITIATE_FAILED" }),
    );
    expect(JSON.stringify(mockRecordHiringOfferAuditEvent.mock.calls)).not.toContain(
      "SPRINGVERIFY",
    );
  });

  it("still records BGV_INITIATE_FAILED with error detail for upstream failures", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "applications") {
        return createMockQueryBuilder({
          data: {
            id: "00000000-0000-4000-8000-000000000001",
            candidate_id: "cand-1",
            jobs: { organisation_id: "org-1" },
          },
        });
      }
      if (table === "candidates") {
        return createMockQueryBuilder({
          data: { email: "cand@test.com", full_name: "Candidate A", phone: null },
        });
      }
      if (table === "offers") {
        return createMockQueryBuilder({ data: { id: "offer-1" } });
      }
      return createMockQueryBuilder();
    });
    mockInitiateSpringVerifyCase.mockResolvedValue({
      ok: false,
      error: "SpringVerify request failed with status 502",
    });

    const { initiateSpringVerifyForApplication } =
      await import("@/lib/integrations/springverify/workflow");

    const result = await initiateSpringVerifyForApplication({
      applicationId: "00000000-0000-4000-8000-000000000001",
      initiatedBy: "user-1",
      expectedOrganisationId: "org-1",
      source: "offer_accept",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected failure");
    expect(result.code).toBe("upstream_error");
    expect(result.status).toBe(502);
    expect(mockRecordHiringOfferAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "BGV_INITIATE_FAILED",
        entityId: "offer-1",
        metadata: expect.objectContaining({
          error: "SpringVerify request failed with status 502",
        }),
      }),
    );
  });

  it("returns success and audit event when initiation works", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "applications") {
        return createMockQueryBuilder({
          data: {
            id: "00000000-0000-4000-8000-000000000001",
            candidate_id: "cand-1",
            jobs: { organisation_id: "org-1" },
          },
        });
      }
      if (table === "candidates") {
        return createMockQueryBuilder({
          data: { email: "cand@test.com", full_name: "Candidate A", phone: null },
        });
      }
      if (table === "offers") {
        return createMockQueryBuilder({ data: { id: "offer-1" } });
      }
      return createMockQueryBuilder();
    });
    mockInitiateSpringVerifyCase.mockResolvedValue({
      ok: true,
      status: 200,
      body: { case_id: "sv-1" },
    });

    const { initiateSpringVerifyForApplication } =
      await import("@/lib/integrations/springverify/workflow");

    const result = await initiateSpringVerifyForApplication({
      applicationId: "00000000-0000-4000-8000-000000000001",
      initiatedBy: "user-1",
      expectedOrganisationId: "org-1",
      source: "api",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected success");
    expect(result.organisationId).toBe("org-1");
    expect(result.offerId).toBe("offer-1");
    expect(mockRecordHiringOfferAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "BGV_INITIATED", entityId: "offer-1" }),
    );
  });

  it("resolves the organisation's own SpringVerify credentials and passes them to the client", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "applications") {
        return createMockQueryBuilder({
          data: {
            id: "00000000-0000-4000-8000-000000000001",
            candidate_id: "cand-1",
            jobs: { organisation_id: "org-1" },
          },
        });
      }
      if (table === "candidates") {
        return createMockQueryBuilder({
          data: { email: "cand@test.com", full_name: "Candidate A", phone: null },
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
              package_id: 16,
              subtype_id: 22,
              webhook_secret_enc: "enc:org-webhook",
            },
          },
        });
      }
      return createMockQueryBuilder();
    });
    mockRetrieveSecret.mockResolvedValue("org-api-token");
    mockDecryptIntegrationToken.mockReturnValue("org-webhook-secret");
    mockInitiateSpringVerifyCase.mockResolvedValue({ ok: true, status: 200, body: {} });

    const { initiateSpringVerifyForApplication } =
      await import("@/lib/integrations/springverify/workflow");

    const result = await initiateSpringVerifyForApplication({
      applicationId: "00000000-0000-4000-8000-000000000001",
      initiatedBy: "user-1",
      expectedOrganisationId: "org-1",
      source: "offer_accept",
    });

    expect(result.ok).toBe(true);
    expect(mockInitiateSpringVerifyCase).toHaveBeenCalledWith(
      expect.objectContaining({ email: "cand@test.com" }),
      expect.objectContaining({
        createCaseUrl: "https://api-sa.in.springverify.com/external/v1/candidate/add",
        apiKey: "org-api-token",
        packageId: 16,
        subtypeId: 22,
        source: "organisation",
      }),
    );
  });

  it("extracts application id and status from payload", async () => {
    const { extractApplicationIdFromSpringVerifyPayload, extractSpringVerifyStatus } =
      await import("@/lib/integrations/springverify/workflow");
    const payload = {
      external_id: "tigerhire:application:00000000-0000-4000-8000-000000000777",
      case_status: "completed",
    };
    expect(extractApplicationIdFromSpringVerifyPayload(payload)).toBe(
      "00000000-0000-4000-8000-000000000777",
    );
    expect(extractSpringVerifyStatus(payload)).toBe("completed");
  });

  it("extracts application id from candidate.meta_data (external/v1 create-case echo)", async () => {
    const { extractApplicationIdFromSpringVerifyPayload, extractSpringVerifyStatus } =
      await import("@/lib/integrations/springverify/workflow");

    const viaAppId = {
      candidate: {
        email: "priya@example.com",
        meta_data: { application_id: "app-echo-1", source: "tigerhire" },
        check_status: "IN PROGRESS",
      },
    };
    expect(extractApplicationIdFromSpringVerifyPayload(viaAppId)).toBe("app-echo-1");
    expect(extractSpringVerifyStatus(viaAppId)).toBe("in progress");

    const viaExternalRef = {
      data: {
        meta_data: { external_reference: "tigerhire:application:app-echo-2" },
        status: "CLEAR",
      },
    };
    expect(extractApplicationIdFromSpringVerifyPayload(viaExternalRef)).toBe("app-echo-2");
    expect(extractSpringVerifyStatus(viaExternalRef)).toBe("clear");

    const rootMeta = {
      meta_data: { external_reference: "tigerhire:application:app-echo-3" },
    };
    expect(extractApplicationIdFromSpringVerifyPayload(rootMeta)).toBe("app-echo-3");
  });
});
