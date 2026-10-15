import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockQueryBuilder } from "../helpers";

const mockAdminFrom = vi.fn();
const mockSendContactNotification = vi.fn().mockResolvedValue(undefined);
const mockIsPublicDomain = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
  }),
}));

vi.mock("@/lib/services/resend", () => ({
  sendContactNotification: (...args: unknown[]) => mockSendContactNotification(...args),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: () => Promise.resolve({ allowed: true }),
  RATE_LIMIT_PRESETS: { publicForm: { limit: 5, windowSecs: 60 } },
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/sso/domain", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sso/domain")>("@/lib/sso/domain");
  return {
    ...actual,
    isPublicDomain: (...args: unknown[]) => mockIsPublicDomain(...args),
  };
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost:3000/api/auth/onboarding-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/onboarding-request", () => {
  beforeEach(() => {
    mockAdminFrom.mockReset();
    mockSendContactNotification.mockClear();
    mockIsPublicDomain.mockReset();
    mockIsPublicDomain.mockResolvedValue(false);
  });

  it("accepts valid onboarding request", async () => {
    const builder = createMockQueryBuilder({ error: null });
    mockAdminFrom.mockReturnValue(builder);
    const { POST } = await import("@/app/api/auth/onboarding-request/route");

    const response = await POST(
      jsonRequest({
        fullName: "Nidhi Gupta",
        workEmail: "nidhi@finstack.in",
        companyName: "Finstack",
        roleTitle: "Company Admin",
        domain: "finstack.in",
        notes: "Please onboard quickly.",
      }) as never,
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(mockSendContactNotification).toHaveBeenCalledTimes(1);
  });

  it("rejects request when work email domain does not match company domain", async () => {
    const { POST } = await import("@/app/api/auth/onboarding-request/route");
    const response = await POST(
      jsonRequest({
        fullName: "Nidhi Gupta",
        workEmail: "nidhi@another.io",
        companyName: "Finstack",
        roleTitle: "Company Admin",
        domain: "finstack.in",
      }) as never,
    );

    expect(response.status).toBe(422);
    const payload = await response.json();
    expect(payload.error).toContain("must match");
  });

  it("rejects public email domains", async () => {
    mockIsPublicDomain.mockResolvedValue(true);
    const { POST } = await import("@/app/api/auth/onboarding-request/route");
    const response = await POST(
      jsonRequest({
        fullName: "A Candidate",
        workEmail: "user@gmail.com",
        companyName: "Acme",
        roleTitle: "HR",
        domain: "gmail.com",
      }) as never,
    );

    expect(response.status).toBe(422);
    const payload = await response.json();
    expect(payload.error).toContain("public email domains");
  });
});
