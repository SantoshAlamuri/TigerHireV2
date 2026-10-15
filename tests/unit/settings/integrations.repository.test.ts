import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getIntegrations,
  maskIntegrationSecret,
  upsertIntegration,
} from "@/lib/repositories/integrations.repository";

function mockTable(result: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
    upsert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
}

describe("integrations.repository", () => {
  it("masks secret refs while preserving other fields", () => {
    const row = maskIntegrationSecret({
      id: "1",
      organisation_id: "org_1",
      provider: "sendgrid",
      auth_type: "api_key",
      status: "connected",
      status_message: null,
      oauth_access_token: null,
      oauth_refresh_token: null,
      oauth_token_expires_at: null,
      oauth_scopes: null,
      oauth_account_email: null,
      secret_ref: "secret-1234",
      config: null,
      created_at: "",
      updated_at: "",
    });

    expect(row.secret_ref).toBeNull();
    expect(row.masked_key).toBe("••••••1234");
  });

  it("queries org integrations", async () => {
    const table = mockTable({ data: [{ id: "1" }], error: null });
    const supabase = { from: vi.fn(() => table) } as unknown as SupabaseClient;

    const rows = await getIntegrations(supabase, "org_1");
    expect(rows).toEqual([{ id: "1" }]);
    expect(supabase.from).toHaveBeenCalledWith("integrations");
    expect(table.eq).toHaveBeenCalledWith("organisation_id", "org_1");
  });

  it("upserts integration by organisation/provider conflict key", async () => {
    const table = mockTable({ data: { id: "1" }, error: null });
    const supabase = { from: vi.fn(() => table) } as unknown as SupabaseClient;

    const row = await upsertIntegration(supabase, "org_1", "sendgrid", {
      status: "connected",
    });

    expect(row).toEqual({ id: "1" });
    expect(table.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ organisation_id: "org_1", provider: "sendgrid" }),
      { onConflict: "organisation_id,provider" },
    );
  });
});
