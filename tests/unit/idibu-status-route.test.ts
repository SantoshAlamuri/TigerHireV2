import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthContext = vi.fn();
const mockGetIdibuCredentials = vi.fn();
const mockIsIdibuCredentialsComplete = vi.fn();
const mockIsIdibuPostingReady = vi.fn();

vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-helpers")>();
  return {
    ...actual,
    getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
    requireAuth: (ctx: { userId?: string } | null) => Boolean(ctx?.userId),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/integrations/idibu/credentials", () => ({
  getIdibuCredentials: (...args: unknown[]) => mockGetIdibuCredentials(...args),
  isIdibuCredentialsComplete: (...args: unknown[]) => mockIsIdibuCredentialsComplete(...args),
  isIdibuPostingReady: (...args: unknown[]) => mockIsIdibuPostingReady(...args),
  buildIdibuWebhookUrl: (orgId: string) => `https://test.example/api/webhooks/idibu/${orgId}`,
}));

describe("GET /api/idibu/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue({
      userId: "user-1",
      organisationId: "org-1",
    });
  });

  it("returns configured and webhook URL when webhook credentials are complete", async () => {
    mockGetIdibuCredentials.mockResolvedValue({
      app_id: "a",
      app_secret: "b",
      integration_name: "",
      webhook_secret: "wh",
      default_sector: "1",
    });
    mockIsIdibuCredentialsComplete.mockReturnValue(true);
    mockIsIdibuPostingReady.mockReturnValue(false);

    const { GET } = await import("@/app/api/idibu/status/route");
    const res = await GET();
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.postingReady).toBe(false);
    expect(body.webhookUrl).toBe("https://test.example/api/webhooks/idibu/org-1");
  });

  it("returns not configured when webhook credentials are incomplete", async () => {
    mockGetIdibuCredentials.mockResolvedValue(null);
    mockIsIdibuCredentialsComplete.mockReturnValue(false);
    mockIsIdibuPostingReady.mockReturnValue(false);

    const { GET } = await import("@/app/api/idibu/status/route");
    const res = await GET();
    const body = await res.json();
    expect(body.configured).toBe(false);
    expect(body.webhookUrl).toBeNull();
  });
});
