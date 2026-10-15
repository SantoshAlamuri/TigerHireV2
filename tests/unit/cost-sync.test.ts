import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = {
  vercelApiToken: "",
  vercelTeamId: "",
  vercelTeamSlug: "",
  supabaseManagementToken: "",
  supabaseProjectRef: "",
  supabaseUsdPerMillionRequests: 2.5,
  anthropicAdminApiKey: "",
  stripeSecretKey: "",
  metaWabaId: "",
  metaGraphAccessToken: "",
  metaGraphApiVersion: "v21.0",
  metaWhatsappUsdPerConversation: {
    marketing: 0.025,
    utility: 0.005,
    authentication: 0.005,
    service: 0,
  },
};

const mockRecordPlatformCostEvent = vi.fn().mockResolvedValue(undefined);
const mockStripeList = vi.fn();

vi.mock("@/lib/config/env", () => ({
  env: mockEnv,
}));

vi.mock("@/lib/costs/ledger", () => ({
  recordPlatformCostEvent: (...args: unknown[]) => mockRecordPlatformCostEvent(...args),
}));

vi.mock("@/lib/services/stripe", () => ({
  getStripe: () => ({
    balanceTransactions: {
      list: (...args: unknown[]) => mockStripeList(...args),
    },
  }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("cost sync providers", () => {
  beforeEach(() => {
    mockEnv.vercelApiToken = "";
    mockEnv.vercelTeamId = "";
    mockEnv.vercelTeamSlug = "";
    mockEnv.supabaseManagementToken = "";
    mockEnv.supabaseProjectRef = "";
    mockEnv.supabaseUsdPerMillionRequests = 2.5;
    mockEnv.anthropicAdminApiKey = "";
    mockEnv.stripeSecretKey = "";
    mockEnv.metaWabaId = "";
    mockEnv.metaGraphAccessToken = "";
    mockRecordPlatformCostEvent.mockClear();
    mockStripeList.mockReset();
  });

  it("returns all providers with explicit skipped status when credentials are missing", async () => {
    const { syncAllPlatformCosts } = await import("@/lib/costs/sync");
    const result = await syncAllPlatformCosts({
      from: new Date("2026-03-01T00:00:00.000Z"),
      to: new Date("2026-03-02T00:00:00.000Z"),
    });

    const providers = result.map((r) => r.provider);
    expect(providers).toEqual([
      "vercel",
      "supabase",
      "anthropic",
      "stripe",
      "meta",
      "upstash",
      "resend",
    ]);
    expect(result.find((r) => r.provider === "meta")?.skipped).toBe(true);
    expect(result.find((r) => r.provider === "upstash")?.skipped).toBe(true);
    expect(result.find((r) => r.provider === "resend")?.skipped).toBe(true);
  });

  it("imports stripe fee events when transactions include fees", async () => {
    mockEnv.stripeSecretKey = "sk_test_123";
    mockStripeList.mockResolvedValue({
      data: [
        {
          id: "txn_1",
          created: 1710000000,
          type: "charge",
          fee: 145,
          net: 9855,
          currency: "usd",
          reporting_category: "charge",
          description: "Card payment",
        },
        {
          id: "txn_2",
          created: 1710000100,
          type: "charge",
          fee: 0,
          net: 10000,
          currency: "usd",
          reporting_category: "charge",
          description: "No fee transaction",
        },
      ],
      has_more: false,
    });

    const { syncStripeFees } = await import("@/lib/costs/sync");
    const result = await syncStripeFees({
      from: new Date("2026-03-01T00:00:00.000Z"),
      to: new Date("2026-03-02T00:00:00.000Z"),
    });

    expect(result.provider).toBe("stripe");
    expect(result.skipped).toBe(false);
    expect(result.imported).toBe(1);
    expect(mockRecordPlatformCostEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordPlatformCostEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "stripe",
        externalId: "txn_1",
        amountUsd: 1.45,
        status: "invoiced",
      }),
    );
  });
});
