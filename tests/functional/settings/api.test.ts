import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const state = vi.hoisted(() => ({
  authResult: {
    context: {
      userId: "user-001",
      role: "leadership",
      organisationId: "org-001",
      actorEmail: "admin@acme.com",
    },
  } as
    | {
        context: {
          userId: string;
          role: string;
          organisationId: string;
          actorEmail: string | null;
        };
      }
    | { error: NextResponse },
  integrations: [
    {
      id: "1",
      organisation_id: "org-001",
      provider: "zoom",
      auth_type: "api_key",
      status: "connected",
      status_message: null,
      oauth_access_token: null,
      oauth_refresh_token: null,
      oauth_token_expires_at: null,
      oauth_scopes: null,
      oauth_account_email: null,
      secret_ref: "vault_ref_1234",
      config: {},
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ],
  privacySettings: {
    consent_message: "This interview will be recorded and transcribed.",
    recording_retention_days: 90,
    transcript_retention_days: 365,
  },
  auditEntries: [
    {
      id: "audit-1",
      event_type: "integration.key_updated",
      resource_type: "integration",
      resource_id: "zoom",
      actor_email: "admin@acme.com",
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ],
}));

vi.mock("@/lib/settings/server", () => ({
  requireSettingsAdmin: vi.fn(async () => state.authResult),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ mock: "supabase" })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => ({ mock: "supabase-admin" })),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  RATE_LIMIT_PRESETS: { default: { limit: 10, windowMs: 60_000 } },
}));

vi.mock("@/lib/services/secrets", () => ({
  storeSecret: vi.fn(async () => "vault-ref-001"),
  deleteSecret: vi.fn(async () => undefined),
}));

vi.mock("@/lib/repositories/integrations.repository", () => ({
  getIntegrations: vi.fn(async () => state.integrations),
  maskIntegrationSecret: vi.fn((row: { secret_ref: string | null }) => ({
    ...row,
    masked_key: row.secret_ref ? `••••••${row.secret_ref.slice(-4)}` : undefined,
    secret_ref: null,
  })),
  upsertIntegration: vi.fn(
    async (_supabase: unknown, _orgId: string, provider: string, data: unknown) => ({
      id: "int-1",
      provider,
      status: "connected",
      ...((data as Record<string, unknown>) ?? {}),
    }),
  ),
  getIntegrationByProvider: vi.fn(async () => state.integrations[0] ?? null),
  writeAuditLog: vi.fn(async () => undefined),
  getAuditLog: vi.fn(async () => state.auditEntries),
  getPrivacySettings: vi.fn(async () => state.privacySettings),
  upsertPrivacySettings: vi.fn(async (_supabase: unknown, orgId: string, data: any) => ({
    organisation_id: orgId,
    consent_message: data.consentMessage,
    recording_retention_days: data.recordingRetentionDays,
    transcript_retention_days: data.transcriptRetentionDays,
  })),
}));

import {
  GET as getIntegrations,
  POST as postIntegration,
} from "@/app/api/settings/integrations/route";
import { DELETE as deleteIntegration } from "@/app/api/settings/integrations/[provider]/route";
import { GET as getPrivacy, POST as postPrivacy } from "@/app/api/settings/privacy/route";
import { GET as getAudit } from "@/app/api/settings/audit/route";

function makeRequest(path: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("settings API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.authResult = {
      context: {
        userId: "user-001",
        role: "leadership",
        organisationId: "org-001",
        actorEmail: "admin@acme.com",
      },
    };
    state.integrations = [
      {
        id: "1",
        organisation_id: "org-001",
        provider: "zoom",
        auth_type: "api_key",
        status: "connected",
        status_message: null,
        oauth_access_token: null,
        oauth_refresh_token: null,
        oauth_token_expires_at: null,
        oauth_scopes: null,
        oauth_account_email: null,
        secret_ref: "vault_ref_1234",
        config: {},
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ];
  });

  it("GET /api/settings/integrations returns masked integrations", async () => {
    const res = await getIntegrations(makeRequest("/api/settings/integrations", "GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.integrations).toHaveLength(1);
    expect(body.integrations[0].secret_ref).toBeNull();
    expect(body.integrations[0].masked_key).toContain("1234");
  });

  it("GET /api/settings/integrations returns auth error as-is", async () => {
    state.authResult = { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    const res = await getIntegrations(makeRequest("/api/settings/integrations", "GET"));
    expect(res.status).toBe(401);
  });

  it("POST /api/settings/integrations saves key and writes audit entry", async () => {
    const res = await postIntegration(
      makeRequest("/api/settings/integrations", "POST", {
        provider: "zoom",
        apiKey: "sk_zoom_valid_key_here",
        config: { recordingStorage: "tigerhire_s3" },
      }),
    );
    expect(res.status).toBe(200);

    const { storeSecret } = await import("@/lib/services/secrets");
    const { writeAuditLog } = await import("@/lib/repositories/integrations.repository");
    expect(storeSecret).toHaveBeenCalledWith(
      "org-001",
      "zoom",
      "api_key",
      "sk_zoom_valid_key_here",
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ event_type: "integration.key_updated" }),
    );
  });

  it("POST /api/settings/integrations rejects invalid payload", async () => {
    const res = await postIntegration(
      makeRequest("/api/settings/integrations", "POST", {
        provider: "invalid_provider",
        apiKey: "some-key",
      }),
    );
    expect(res.status).toBe(422);
  });

  it("DELETE /api/settings/integrations/[provider] validates provider", async () => {
    const res = await deleteIntegration(
      makeRequest("/api/settings/integrations/unknown", "DELETE"),
      {
        params: Promise.resolve({ provider: "unknown" }),
      },
    );
    expect(res.status).toBe(400);
  });

  it("DELETE /api/settings/integrations/[provider] disconnects integration", async () => {
    const res = await deleteIntegration(makeRequest("/api/settings/integrations/zoom", "DELETE"), {
      params: Promise.resolve({ provider: "zoom" }),
    });
    expect(res.status).toBe(200);

    const { deleteSecret } = await import("@/lib/services/secrets");
    const { writeAuditLog } = await import("@/lib/repositories/integrations.repository");
    expect(deleteSecret).toHaveBeenCalledWith("vault_ref_1234");
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ event_type: "integration.disconnected" }),
    );
  });

  it("GET /api/settings/privacy returns privacy settings", async () => {
    const res = await getPrivacy(makeRequest("/api/settings/privacy", "GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.privacySettings.recording_retention_days).toBe(90);
  });

  it("POST /api/settings/privacy validates content", async () => {
    const res = await postPrivacy(
      makeRequest("/api/settings/privacy", "POST", {
        consentMessage: "Too short",
        recordingRetentionDays: 90,
        transcriptRetentionDays: 365,
      }),
    );
    expect(res.status).toBe(422);
  });

  it("GET /api/settings/audit returns entries", async () => {
    const res = await getAudit(makeRequest("/api/settings/audit?limit=10", "GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toHaveLength(1);
  });
});
