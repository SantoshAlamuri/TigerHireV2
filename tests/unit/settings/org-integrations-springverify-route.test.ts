import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireSettingsAdmin = vi.fn();
const mockGetConnection = vi.fn();
const mockUpsertConnection = vi.fn();
const mockListConnections = vi.fn();
const mockStoreSecret = vi.fn();
const mockEncryptIntegrationToken = vi.fn();
const mockWriteAuditLog = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockValidateOrigin = vi.fn();

vi.mock("@/lib/settings/server", () => ({
  requireSettingsAdmin: (...args: unknown[]) => mockRequireSettingsAdmin(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({ from: vi.fn() }),
}));

vi.mock("@/lib/repositories/integration-connections.repository", () => ({
  getConnection: (...args: unknown[]) => mockGetConnection(...args),
  upsertConnection: (...args: unknown[]) => mockUpsertConnection(...args),
  listConnections: (...args: unknown[]) => mockListConnections(...args),
}));

vi.mock("@/lib/services/secrets", () => ({
  storeSecret: (...args: unknown[]) => mockStoreSecret(...args),
  encryptIntegrationToken: (...args: unknown[]) => mockEncryptIntegrationToken(...args),
}));

vi.mock("@/lib/repositories/integrations.repository", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: (...args: unknown[]) => mockValidateOrigin(...args),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  buildScopedRateLimitKey: () => "test-key",
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  RATE_LIMIT_PRESETS: { default: { limit: 10, windowSecs: 60 } },
}));

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/settings/org/integrations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  provider: "springverify",
  apiKey: "sv-org-token-123456",
  config: {
    create_case_url: "https://api-sa.in.springverify.com/external/v1/candidate/add",
    package_id: "16",
    subtype_id: "22",
    webhook_secret: "org-webhook-secret",
  },
};

describe("POST /api/settings/org/integrations — springverify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateOrigin.mockReturnValue(null);
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockRequireSettingsAdmin.mockResolvedValue({
      context: {
        organisationId: "org-1",
        userId: "user-1",
        actorEmail: "admin@example.com",
      },
    });
    mockGetConnection.mockResolvedValue(null);
    mockStoreSecret.mockResolvedValue("vault-ref-1");
    mockEncryptIntegrationToken.mockReturnValue("enc:mock-webhook");
    mockUpsertConnection.mockImplementation(async (_supabase, payload) => ({
      id: "conn-1",
      status_message: null,
      oauth_account_email: null,
      updated_at: "2026-07-10T00:00:00Z",
      ...payload,
    }));
  });

  it("rejects when the caller is not a settings admin", async () => {
    const { Response: NodeResponse } = globalThis as { Response: typeof Response };
    mockRequireSettingsAdmin.mockResolvedValue({
      error: new NodeResponse(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    });

    const { POST } = await import("@/app/api/settings/org/integrations/route");
    const res = await POST(buildRequest(validBody) as never);
    expect(res.status).toBe(403);
    expect(mockUpsertConnection).not.toHaveBeenCalled();
    expect(mockStoreSecret).not.toHaveBeenCalled();
  });

  it("enforces CSRF origin validation before anything else", async () => {
    const { Response: NodeResponse } = globalThis as { Response: typeof Response };
    mockValidateOrigin.mockReturnValue(
      new NodeResponse(JSON.stringify({ error: "Bad origin" }), { status: 403 }),
    );

    const { POST } = await import("@/app/api/settings/org/integrations/route");
    const res = await POST(buildRequest(validBody) as never);
    expect(res.status).toBe(403);
    expect(mockRequireSettingsAdmin).not.toHaveBeenCalled();
  });

  it("rejects a non-https create-case URL", async () => {
    const { POST } = await import("@/app/api/settings/org/integrations/route");
    const res = await POST(
      buildRequest({
        ...validBody,
        config: { ...validBody.config, create_case_url: "http://insecure.example.com/add" },
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(mockUpsertConnection).not.toHaveBeenCalled();
  });

  it("rejects package_id without subtype_id", async () => {
    const { POST } = await import("@/app/api/settings/org/integrations/route");
    const res = await POST(
      buildRequest({
        ...validBody,
        config: { ...validBody.config, subtype_id: "" },
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(mockUpsertConnection).not.toHaveBeenCalled();
  });

  it("stores the token as a secret ref and the webhook secret encrypted, never plaintext", async () => {
    const { POST } = await import("@/app/api/settings/org/integrations/route");
    const res = await POST(buildRequest(validBody) as never);
    expect(res.status).toBe(200);

    expect(mockStoreSecret).toHaveBeenCalledWith(
      "org-1",
      "springverify",
      "api_key",
      "sv-org-token-123456",
    );
    expect(mockEncryptIntegrationToken).toHaveBeenCalledWith("org-webhook-secret");

    const upsertPayload = mockUpsertConnection.mock.calls[0][1] as {
      provider: string;
      secret_ref: string;
      config: Record<string, unknown>;
    };
    expect(upsertPayload.provider).toBe("springverify");
    expect(upsertPayload.secret_ref).toBe("vault-ref-1");
    expect(upsertPayload.config).toEqual({
      create_case_url: "https://api-sa.in.springverify.com/external/v1/candidate/add",
      package_id: 16,
      subtype_id: 22,
      webhook_secret_enc: "enc:mock-webhook",
    });
    // Plaintext secrets must never be persisted in config.
    expect(upsertPayload.config).not.toHaveProperty("webhook_secret");
    expect(upsertPayload.config).not.toHaveProperty("apiKey");

    // Response must not echo the secret ref.
    const json = (await res.json()) as { integration?: { secret_ref?: unknown } };
    expect(json.integration?.secret_ref).toBeNull();

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ event_type: "integration.key_updated" }),
    );
  });

  it("preserves the previously stored encrypted webhook secret when omitted", async () => {
    mockGetConnection.mockResolvedValue({
      id: "conn-1",
      provider: "springverify",
      status: "connected",
      config: { webhook_secret_enc: "enc:prior-secret" },
    });

    const { POST } = await import("@/app/api/settings/org/integrations/route");
    const res = await POST(
      buildRequest({
        ...validBody,
        config: { ...validBody.config, webhook_secret: "" },
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(mockEncryptIntegrationToken).not.toHaveBeenCalled();

    const upsertPayload = mockUpsertConnection.mock.calls[0][1] as {
      config: Record<string, unknown>;
    };
    expect(upsertPayload.config.webhook_secret_enc).toBe("enc:prior-secret");
  });
});
