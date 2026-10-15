import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    rpc,
  }),
}));

describe("settings secrets service", () => {
  beforeEach(() => {
    rpc.mockReset();
    process.env.INTEGRATION_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  it("stores in vault when rpc works", async () => {
    rpc.mockResolvedValueOnce({ data: "vault-secret-id", error: null });
    const { storeSecret } = await import("@/lib/services/secrets");
    const ref = await storeSecret("org-1", "zoom", "api_key", "secret-value");
    expect(ref).toBe("vault-secret-id");
  });

  it("falls back to encrypted ref when vault rpc fails", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error("missing rpc") });
    const { storeSecret, retrieveSecret } = await import("@/lib/services/secrets");
    const ref = await storeSecret("org-1", "zoom", "api_key", "secret-value");

    expect(ref.startsWith("enc:")).toBe(true);
    expect(await retrieveSecret(ref)).toBe("secret-value");
  });
});
