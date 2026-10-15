import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireSettingsAdmin = vi.fn();
const mockGetConnection = vi.fn();
const mockUpsertConnection = vi.fn();
const mockRetrieveSecret = vi.fn();
const mockWriteAuditLog = vi.fn();
const mockValidateSsoProviderConfig = vi.fn();
const mockValidateKekaConnection = vi.fn();
const mockValidateHiBobConnection = vi.fn();
const mockValidateDarwinboxConnection = vi.fn();
const mockValidateBambooHrConnection = vi.fn();
const mockValidateWorkdayConnection = vi.fn();
const mockCheckRateLimit = vi.fn();

vi.mock("@/lib/settings/server", () => ({
  requireSettingsAdmin: (...args: unknown[]) => mockRequireSettingsAdmin(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({ from: vi.fn() }),
}));

vi.mock("@/lib/repositories/integration-connections.repository", () => ({
  getConnection: (...args: unknown[]) => mockGetConnection(...args),
  upsertConnection: (...args: unknown[]) => mockUpsertConnection(...args),
}));

vi.mock("@/lib/services/secrets", () => ({
  retrieveSecret: (...args: unknown[]) => mockRetrieveSecret(...args),
}));

vi.mock("@/lib/repositories/integrations.repository", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

vi.mock("@/lib/integrations/providers/sso", () => ({
  validateSsoProviderConfig: (...args: unknown[]) => mockValidateSsoProviderConfig(...args),
}));

vi.mock("@/lib/integrations/providers/keka", () => ({
  validateKekaConnection: (...args: unknown[]) => mockValidateKekaConnection(...args),
}));

vi.mock("@/lib/integrations/providers/hibob", () => ({
  validateHiBobConnection: (...args: unknown[]) => mockValidateHiBobConnection(...args),
}));

vi.mock("@/lib/integrations/providers/darwinbox", () => ({
  validateDarwinboxConnection: (...args: unknown[]) => mockValidateDarwinboxConnection(...args),
}));

vi.mock("@/lib/integrations/providers/bamboohr", () => ({
  validateBambooHrConnection: (...args: unknown[]) => mockValidateBambooHrConnection(...args),
}));

vi.mock("@/lib/integrations/providers/workday", () => ({
  validateWorkdayConnection: (...args: unknown[]) => mockValidateWorkdayConnection(...args),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  buildScopedRateLimitKey: ({ route, userId, organisationId, ip }: any) =>
    `${route}:${organisationId ?? userId ?? ip ?? "anon"}`,
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

describe("POST /api/settings/org/integrations/validate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSettingsAdmin.mockResolvedValue({
      context: {
        organisationId: "org-1",
        userId: "user-1",
        actorEmail: "admin@example.com",
      },
    });
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockWriteAuditLog.mockResolvedValue(undefined);
  });

  it("validates Keka and persists connected status", async () => {
    mockGetConnection.mockResolvedValue({
      scope: "organisation",
      provider: "keka",
      organisation_id: "org-1",
      owner_user_id: null,
      auth_type: "api_key",
      secret_ref: "secret-ref",
      status: "connected",
      status_message: null,
      config: { clientId: "cid", clientSecret: "csecret" },
    });
    mockRetrieveSecret.mockResolvedValue("keka_api_key");
    mockValidateKekaConnection.mockResolvedValue({
      ok: true,
      status: "connected",
      message: "Keka validated",
    });
    mockUpsertConnection.mockResolvedValue({
      provider: "keka",
      status: "connected",
      status_message: "Keka validated",
      updated_at: new Date().toISOString(),
      secret_ref: "secret-ref",
      config: {},
    });

    const { POST } = await import("@/app/api/settings/org/integrations/validate/route");
    const response = await POST(
      new Request("http://localhost/api/settings/org/integrations/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "keka" }),
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(mockValidateKekaConnection).toHaveBeenCalled();
    expect(mockUpsertConnection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: "keka",
        status: "connected",
        status_message: "Keka validated",
      }),
    );
  });

  it("returns not implemented for unsupported provider", async () => {
    mockGetConnection.mockResolvedValue({
      scope: "organisation",
      provider: "adzuna",
      organisation_id: "org-1",
      owner_user_id: null,
      auth_type: "api_key",
      secret_ref: "secret-ref",
      status: "connected",
      status_message: null,
      config: {},
    });
    mockRetrieveSecret.mockResolvedValue("secret");

    const { POST } = await import("@/app/api/settings/org/integrations/validate/route");
    const response = await POST(
      new Request("http://localhost/api/settings/org/integrations/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "adzuna" }),
      }) as never,
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toContain("Validation is not implemented");
  });

  it("validates BambooHR and persists connected status", async () => {
    mockGetConnection.mockResolvedValue({
      scope: "organisation",
      provider: "bamboohr",
      organisation_id: "org-1",
      owner_user_id: null,
      auth_type: "api_key",
      secret_ref: "secret-ref",
      status: "connected",
      status_message: null,
      config: { companyDomain: "acme" },
    });
    mockRetrieveSecret.mockResolvedValue("bamboo_api_key");
    mockValidateBambooHrConnection.mockResolvedValue({
      ok: true,
      status: "connected",
      message: "BambooHR validated",
    });
    mockUpsertConnection.mockResolvedValue({
      provider: "bamboohr",
      status: "connected",
      status_message: "BambooHR validated",
      updated_at: new Date().toISOString(),
      secret_ref: "secret-ref",
      config: {},
    });

    const { POST } = await import("@/app/api/settings/org/integrations/validate/route");
    const response = await POST(
      new Request("http://localhost/api/settings/org/integrations/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "bamboohr" }),
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(mockValidateBambooHrConnection).toHaveBeenCalled();
    expect(mockUpsertConnection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: "bamboohr",
        status: "connected",
        status_message: "BambooHR validated",
      }),
    );
  });

  it("validates Workday and persists connected status", async () => {
    mockGetConnection.mockResolvedValue({
      scope: "organisation",
      provider: "workday",
      organisation_id: "org-1",
      owner_user_id: null,
      auth_type: "api_key",
      secret_ref: "secret-ref",
      status: "connected",
      status_message: null,
      config: { tokenUrl: "https://example.workday.com/oauth2/token", clientId: "cid" },
    });
    mockRetrieveSecret.mockResolvedValue("workday_client_secret");
    mockValidateWorkdayConnection.mockResolvedValue({
      ok: true,
      status: "connected",
      message: "Workday validated",
    });
    mockUpsertConnection.mockResolvedValue({
      provider: "workday",
      status: "connected",
      status_message: "Workday validated",
      updated_at: new Date().toISOString(),
      secret_ref: "secret-ref",
      config: {},
    });

    const { POST } = await import("@/app/api/settings/org/integrations/validate/route");
    const response = await POST(
      new Request("http://localhost/api/settings/org/integrations/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "workday" }),
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(mockValidateWorkdayConnection).toHaveBeenCalled();
    expect(mockUpsertConnection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: "workday",
        status: "connected",
        status_message: "Workday validated",
      }),
    );
  });
});
