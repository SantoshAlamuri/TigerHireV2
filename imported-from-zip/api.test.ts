/**
 * API / integration tests: settings routes
 * File: tests/functional/settings/api.test.ts
 * Run: npx vitest run tests/functional/settings/api.test.ts
 *
 * These tests call the Next.js route handlers directly (not via HTTP).
 * They mock Supabase and secrets service — no real DB or network calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockSession = {
  user: { id: "user-001", email: "admin@acme.com" },
};

const mockAdminMember = {
  data: { organization_id: "org-001", role: "admin" },
  error: null,
};

const mockNonAdminMember = {
  data: { organization_id: "org-001", role: "recruiter" },
  error: null,
};

vi.mock("@/lib/supabase/server", () => {
  let memberData = mockAdminMember;
  return {
    createClient: () => ({
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } }) },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(memberData),
        then: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    }),
    __setMemberData: (d: typeof mockAdminMember) => {
      memberData = d;
    },
  };
});

vi.mock("@/lib/services/secrets", () => ({
  storeSecret: vi.fn().mockResolvedValue("vault-ref-001"),
  deleteSecret: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/repositories/integrations.repository", () => ({
  getIntegrations: vi
    .fn()
    .mockResolvedValue([
      { id: "1", provider: "zoom", status: "connected", masked_key: "••••xyz9", config: {} },
    ]),
  upsertIntegration: vi.fn().mockResolvedValue({ id: "1", provider: "zoom", status: "connected" }),
  disconnectIntegration: vi.fn().mockResolvedValue(undefined),
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  getAuditLog: vi.fn().mockResolvedValue([]),
  getPrivacySettings: vi.fn().mockResolvedValue({
    consentMessage: "This interview will be recorded.",
    recordingRetentionDays: 90,
    transcriptRetentionDays: 365,
  }),
  upsertPrivacySettings: vi.fn().mockResolvedValue(undefined),
}));

import {
  GET as getIntegrations,
  POST as postIntegration,
} from "@/app/api/settings/integrations/route";
import { DELETE as deleteIntegration } from "@/app/api/settings/integrations/[provider]/route";
import { GET as getPrivacy, POST as postPrivacy } from "@/app/api/settings/privacy/route";
import { GET as getAudit } from "@/app/api/settings/audit/route";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(method: string, body?: unknown, params?: Record<string, string>) {
  const url = new URL(
    `http://localhost/api/settings/integrations${params?.provider ? `/${params.provider}` : ""}`,
  );
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ─── GET /api/settings/integrations ─────────────────────────────────────────

describe("GET /api/settings/integrations", () => {
  it("returns 200 with integrations for admin", async () => {
    const req = makeRequest("GET");
    const res = await getIntegrations(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.integrations).toHaveLength(1);
    expect(body.integrations[0].provider).toBe("zoom");
  });

  it("never returns secret_ref in response", async () => {
    const req = makeRequest("GET");
    const res = await getIntegrations(req);
    const body = await res.json();
    body.integrations.forEach((i: Record<string, unknown>) => {
      expect(i).not.toHaveProperty("secret_ref");
      expect(i).not.toHaveProperty("oauth_access_token");
      expect(i).not.toHaveProperty("oauth_refresh_token");
    });
  });

  it("returns 401 when not authenticated", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient().auth.getSession).mockResolvedValueOnce({
      data: { session: null },
    } as any);
    const req = makeRequest("GET");
    const res = await getIntegrations(req);
    expect(res.status).toBe(401);
  });
});

// ─── POST /api/settings/integrations ────────────────────────────────────────

describe("POST /api/settings/integrations", () => {
  it("saves a valid Zoom API key and returns 200", async () => {
    const req = makeRequest("POST", {
      provider: "zoom",
      apiKey: "sk_zoom_valid_key_here",
      config: { recordingStorage: "tigerhire_s3" },
    });
    const res = await postIntegration(req);
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid provider", async () => {
    const req = makeRequest("POST", {
      provider: "invalid_provider",
      apiKey: "some-key",
    });
    const res = await postIntegration(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 if apiKey is too short", async () => {
    const req = makeRequest("POST", {
      provider: "zoom",
      apiKey: "short",
    });
    const res = await postIntegration(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Key too short");
  });

  it("returns 403 for non-admin user", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient().from("").single).mockResolvedValueOnce(mockNonAdminMember as any);
    const req = makeRequest("POST", {
      provider: "zoom",
      apiKey: "zoom-api-route-unit-test-placeholder-not-a-secret",
    });
    const res = await postIntegration(req);
    expect(res.status).toBe(403);
  });

  it("writes to audit log after successful save", async () => {
    const { writeAuditLog } = await import("@/lib/repositories/integrations.repository");
    const req = makeRequest("POST", {
      provider: "assemblyai",
      apiKey: "assemblyai-api-route-unit-test-placeholder-not-a-secret",
    });
    await postIntegration(req);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "integration.key_updated" }),
    );
  });
});

// ─── DELETE /api/settings/integrations/[provider] ───────────────────────────

describe("DELETE /api/settings/integrations/[provider]", () => {
  it("disconnects a valid provider and returns 200", async () => {
    const req = makeRequest("DELETE");
    const res = await deleteIntegration(req, { params: { provider: "zoom" } });
    expect(res.status).toBe(200);
  });

  it("returns 400 for unknown provider", async () => {
    const req = makeRequest("DELETE");
    const res = await deleteIntegration(req, { params: { provider: "unknown" } });
    expect(res.status).toBe(400);
  });

  it("writes disconnect event to audit log", async () => {
    const { writeAuditLog } = await import("@/lib/repositories/integrations.repository");
    const req = makeRequest("DELETE");
    await deleteIntegration(req, { params: { provider: "zoom" } });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "integration.disconnected" }),
    );
  });
});

// ─── GET + POST /api/settings/privacy ────────────────────────────────────────

describe("GET /api/settings/privacy", () => {
  it("returns current privacy settings", async () => {
    const req = makeRequest("GET");
    const res = await getPrivacy(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recordingRetentionDays).toBe(90);
    expect(body.consentMessage).toBeDefined();
  });
});

describe("POST /api/settings/privacy", () => {
  it("saves valid privacy settings", async () => {
    const req = makeRequest("POST", {
      consentMessage: "This interview will be recorded and transcribed. By continuing you consent.",
      recordingRetentionDays: 60,
      transcriptRetentionDays: 180,
    });
    const res = await postPrivacy(req);
    expect(res.status).toBe(200);
  });

  it("rejects consent message under 20 characters", async () => {
    const req = makeRequest("POST", {
      consentMessage: "Too short",
      recordingRetentionDays: 90,
      transcriptRetentionDays: 365,
    });
    const res = await postPrivacy(req);
    expect(res.status).toBe(400);
  });

  it("rejects retention period above maximum", async () => {
    const req = makeRequest("POST", {
      consentMessage: "This interview will be recorded and transcribed. By continuing you consent.",
      recordingRetentionDays: 999, // above max of 730
      transcriptRetentionDays: 365,
    });
    const res = await postPrivacy(req);
    expect(res.status).toBe(400);
  });
});

// ─── GET /api/settings/audit ─────────────────────────────────────────────────

describe("GET /api/settings/audit", () => {
  it("returns audit log entries for admin", async () => {
    const req = makeRequest("GET");
    const res = await getAudit(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.entries)).toBe(true);
  });

  it("returns 403 for non-admin", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient().from("").single).mockResolvedValueOnce(mockNonAdminMember as any);
    const req = makeRequest("GET");
    const res = await getAudit(req);
    expect(res.status).toBe(403);
  });
});
