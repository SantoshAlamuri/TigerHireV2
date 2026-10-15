/**
 * Unit tests: integrations repository + secrets service
 * File: tests/unit/settings/integrations.repository.test.ts
 * Run: npx vitest run tests/unit/settings/integrations.repository.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockSupabase = { rpc: mockRpc, from: mockFrom };

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockSupabase,
}));

vi.mock("@/lib/services/secrets", () => ({
  storeSecret: vi.fn().mockResolvedValue("secret-ref-uuid-123"),
  retrieveSecret: vi.fn().mockResolvedValue("raw-api-key-value"),
  deleteSecret: vi.fn().mockResolvedValue(undefined),
}));

import {
  getIntegrations,
  upsertIntegration,
  disconnectIntegration,
  getIntegrationByProvider,
  writeAuditLog,
  getAuditLog,
  getPrivacySettings,
  upsertPrivacySettings,
} from "@/lib/repositories/integrations.repository";

import { storeSecret, deleteSecret } from "@/lib/services/secrets";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ORG_ID = "org-uuid-001";
const USER_ID = "user-uuid-001";

function mockChain(returnValue: unknown) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(returnValue),
    then: vi.fn().mockResolvedValue(returnValue),
  };
  chain.select.mockReturnValue({
    ...chain,
    data: (returnValue as any)?.data,
    error: (returnValue as any)?.error,
  });
  mockFrom.mockReturnValue(chain);
  return chain;
}

// ─── getIntegrations ─────────────────────────────────────────────────────────

describe("getIntegrations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns integrations for an org without exposing secret_ref", async () => {
    const raw = [
      {
        id: "1",
        organization_id: ORG_ID,
        provider: "zoom",
        status: "connected",
        secret_ref: "ref-abc",
        config: {},
      },
      {
        id: "2",
        organization_id: ORG_ID,
        provider: "assemblyai",
        status: "disconnected",
        secret_ref: null,
        config: {},
      },
    ];
    mockChain({ data: raw, error: null });

    const result = await getIntegrations(ORG_ID);

    expect(result).toHaveLength(2);
    result.forEach((r) => {
      expect(r).not.toHaveProperty("secret_ref");
    });
  });

  it("masks the API key — shows last 4 chars only", async () => {
    mockChain({
      data: [
        {
          id: "1",
          organization_id: ORG_ID,
          provider: "zoom",
          status: "connected",
          secret_ref: "ref-abc",
          config: {},
        },
      ],
      error: null,
    });

    const result = await getIntegrations(ORG_ID);
    expect(result[0].masked_key).toMatch(/^•+.{4}$/);
  });

  it("throws if Supabase returns an error", async () => {
    mockChain({ data: null, error: { message: "DB error" } });
    await expect(getIntegrations(ORG_ID)).rejects.toThrow("DB error");
  });
});

// ─── upsertIntegration ───────────────────────────────────────────────────────

describe("upsertIntegration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls storeSecret and saves the ref, not the raw key", async () => {
    mockChain({ data: { id: "1" }, error: null });

    const zoomTestKey = "zoom-integration-unit-test-placeholder-not-a-secret";

    await upsertIntegration(ORG_ID, "zoom", {
      rawApiKey: zoomTestKey,
      config: {},
    });

    expect(storeSecret).toHaveBeenCalledWith(ORG_ID, "zoom", "apiKey", zoomTestKey);
    const upsertCall = mockFrom().upsert.mock.calls[0]?.[0];
    expect(upsertCall).not.toHaveProperty("rawApiKey");
    expect(upsertCall?.secret_ref).toBe("secret-ref-uuid-123");
  });

  it("sets status to connected after successful upsert", async () => {
    mockChain({ data: { id: "1" }, error: null });
    await upsertIntegration(ORG_ID, "assemblyai", {
      rawApiKey: "assemblyai-unit-test-placeholder-not-a-secret",
    });
    const upsertCall = mockFrom().upsert.mock.calls[0]?.[0];
    expect(upsertCall?.status).toBe("connected");
  });
});

// ─── disconnectIntegration ───────────────────────────────────────────────────

describe("disconnectIntegration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the secret and sets status to disconnected", async () => {
    mockChain({
      data: { secret_ref: "ref-to-delete" },
      error: null,
    });
    mockFrom().single.mockResolvedValueOnce({ data: { secret_ref: "ref-to-delete" }, error: null });
    mockChain({ data: { id: "1" }, error: null });

    await disconnectIntegration(ORG_ID, "zoom");

    expect(deleteSecret).toHaveBeenCalledWith("ref-to-delete");
  });

  it("nulls out oauth fields when disconnecting an OAuth provider", async () => {
    mockFrom().single.mockResolvedValueOnce({
      data: { secret_ref: null, oauth_access_token: "tok", oauth_refresh_token: "ref" },
      error: null,
    });
    mockChain({ data: {}, error: null });

    await disconnectIntegration(ORG_ID, "google_calendar");

    const updateCall = mockFrom().update.mock.calls[0]?.[0];
    expect(updateCall?.oauth_access_token).toBeNull();
    expect(updateCall?.oauth_refresh_token).toBeNull();
    expect(updateCall?.status).toBe("disconnected");
  });
});

// ─── writeAuditLog ───────────────────────────────────────────────────────────

describe("writeAuditLog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts an audit row with required fields", async () => {
    mockChain({ data: { id: "audit-1" }, error: null });

    await writeAuditLog({
      organizationId: ORG_ID,
      actorUserId: USER_ID,
      actorEmail: "admin@acme.com",
      eventType: "integration.key_updated",
      resourceType: "integration",
      resourceId: "zoom",
      metadata: { provider: "zoom" },
    });

    const insertCall = mockFrom().insert.mock.calls[0]?.[0];
    expect(insertCall?.event_type).toBe("integration.key_updated");
    expect(insertCall?.organization_id).toBe(ORG_ID);
    expect(insertCall?.actor_user_id).toBe(USER_ID);
  });
});

// ─── privacySettings ─────────────────────────────────────────────────────────

describe("getPrivacySettings", () => {
  it("returns defaults if no row exists", async () => {
    mockFrom().single.mockResolvedValue({ data: null, error: { code: "PGRST116" } });

    const result = await getPrivacySettings(ORG_ID);

    expect(result.recordingRetentionDays).toBe(90);
    expect(result.transcriptRetentionDays).toBe(365);
    expect(result.consentMessage).toContain("recorded and transcribed");
  });
});

describe("upsertPrivacySettings", () => {
  it("validates and rejects retention below minimum", async () => {
    await expect(
      upsertPrivacySettings(ORG_ID, {
        consentMessage: "This interview will be recorded.",
        recordingRetentionDays: 3, // below min of 7
        transcriptRetentionDays: 365,
      }),
    ).rejects.toThrow();
  });
});
