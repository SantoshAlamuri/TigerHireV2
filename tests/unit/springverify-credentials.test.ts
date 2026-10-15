import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockQueryBuilder } from "../helpers";

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

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const ENV_KEYS = [
  "SPRINGVERIFY_API_KEY",
  "SPRINGVERIFY_CREATE_CASE_URL",
  "SPRINGVERIFY_PACKAGE_ID",
  "SPRINGVERIFY_SUBTYPE_ID",
  "SPRINGVERIFY_WEBHOOK_SECRET",
];

function orgConnectionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "conn-1",
    scope: "organisation",
    organisation_id: "org-1",
    owner_user_id: null,
    provider: "springverify",
    auth_type: "api_key",
    status: "connected",
    secret_ref: "vault-ref-1",
    config: {
      create_case_url: "https://api-sa.in.springverify.com/external/v1/candidate/add",
      package_id: "16",
      subtype_id: 22,
      webhook_secret_enc: "enc:org-webhook",
    },
    updated_at: "2026-07-10T00:00:00Z",
    ...overrides,
  };
}

describe("getSpringVerifyCredentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it("resolves the organisation's own credentials (BYO account)", async () => {
    mockFrom.mockImplementation((table: string) =>
      table === "integration_connections"
        ? createMockQueryBuilder({ data: orgConnectionRow() })
        : createMockQueryBuilder(),
    );
    mockRetrieveSecret.mockResolvedValue("org-api-token");
    mockDecryptIntegrationToken.mockReturnValue("org-webhook-secret");

    const { getSpringVerifyCredentials } =
      await import("@/lib/integrations/springverify/credentials");
    const creds = await getSpringVerifyCredentials("org-1");

    expect(creds).toEqual({
      createCaseUrl: "https://api-sa.in.springverify.com/external/v1/candidate/add",
      apiKey: "org-api-token",
      packageId: 16,
      subtypeId: 22,
      webhookSecret: "org-webhook-secret",
      source: "organisation",
    });
    expect(mockRetrieveSecret).toHaveBeenCalledWith("vault-ref-1");
    expect(mockDecryptIntegrationToken).toHaveBeenCalledWith("enc:org-webhook");
  });

  it("falls back to platform env vars when the org has no connection", async () => {
    mockFrom.mockImplementation(() => createMockQueryBuilder());
    process.env.SPRINGVERIFY_CREATE_CASE_URL = "https://env.example.com/add";
    process.env.SPRINGVERIFY_API_KEY = "env-token";
    process.env.SPRINGVERIFY_PACKAGE_ID = "5";
    process.env.SPRINGVERIFY_SUBTYPE_ID = "7";
    process.env.SPRINGVERIFY_WEBHOOK_SECRET = "env-secret";

    const { getSpringVerifyCredentials } =
      await import("@/lib/integrations/springverify/credentials");
    const creds = await getSpringVerifyCredentials("org-1");

    expect(creds).toEqual({
      createCaseUrl: "https://env.example.com/add",
      apiKey: "env-token",
      packageId: 5,
      subtypeId: 7,
      webhookSecret: "env-secret",
      source: "platform_env",
    });
  });

  it("ignores a disconnected org connection and uses env fallback", async () => {
    mockFrom.mockImplementation((table: string) =>
      table === "integration_connections"
        ? createMockQueryBuilder({ data: orgConnectionRow({ status: "disconnected" }) })
        : createMockQueryBuilder(),
    );
    process.env.SPRINGVERIFY_CREATE_CASE_URL = "https://env.example.com/add";
    process.env.SPRINGVERIFY_API_KEY = "env-token";

    const { getSpringVerifyCredentials } =
      await import("@/lib/integrations/springverify/credentials");
    const creds = await getSpringVerifyCredentials("org-1");

    expect(creds?.source).toBe("platform_env");
    expect(mockRetrieveSecret).not.toHaveBeenCalled();
  });

  it("returns null when neither org nor env is configured", async () => {
    mockFrom.mockImplementation(() => createMockQueryBuilder());

    const { getSpringVerifyCredentials } =
      await import("@/lib/integrations/springverify/credentials");
    expect(await getSpringVerifyCredentials("org-1")).toBeNull();
  });

  it("uses env directly when no organisation id is available", async () => {
    process.env.SPRINGVERIFY_CREATE_CASE_URL = "https://env.example.com/add";
    process.env.SPRINGVERIFY_API_KEY = "env-token";

    const { getSpringVerifyCredentials } =
      await import("@/lib/integrations/springverify/credentials");
    const creds = await getSpringVerifyCredentials(null);

    expect(creds?.source).toBe("platform_env");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("tolerates a webhook secret that fails to decrypt (case creation still works)", async () => {
    mockFrom.mockImplementation((table: string) =>
      table === "integration_connections"
        ? createMockQueryBuilder({ data: orgConnectionRow() })
        : createMockQueryBuilder(),
    );
    mockRetrieveSecret.mockResolvedValue("org-api-token");
    mockDecryptIntegrationToken.mockImplementation(() => {
      throw new Error("bad ciphertext");
    });

    const { getSpringVerifyCredentials } =
      await import("@/lib/integrations/springverify/credentials");
    const creds = await getSpringVerifyCredentials("org-1");

    expect(creds?.source).toBe("organisation");
    expect(creds?.apiKey).toBe("org-api-token");
    expect(creds?.webhookSecret).toBeNull();
  });
});
