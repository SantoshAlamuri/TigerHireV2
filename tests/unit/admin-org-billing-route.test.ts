import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockFrom = vi.fn();
const mockEnsure = vi.fn();
const mockGetState = vi.fn();
const mockAdjust = vi.fn();
const mockRequirePlatformAdmin = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  jsonError: (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  jsonSuccess: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
  parseJsonBody: async (request: Request) => {
    const body = await request.json();
    return { body, errorResponse: null };
  },
  handleZodError: () =>
    new Response(JSON.stringify({ error: "Invalid body" }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/security/platform-admin", () => ({
  requirePlatformAdmin: (...args: unknown[]) => mockRequirePlatformAdmin(...args),
}));

vi.mock("@/lib/security/csrf", () => ({ validateOrigin: () => null }));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

vi.mock("@/lib/services/manual-billing", () => ({
  ensureBillingProfileAndWallet: (...args: unknown[]) => mockEnsure(...args),
  getManualBillingState: (...args: unknown[]) => mockGetState(...args),
  adjustOrganisationCredits: (...args: unknown[]) => mockAdjust(...args),
}));

const ADMIN_CTX = { userId: "admin-1", organisationId: null, isPlatformAdmin: true };

describe("admin org billing routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequirePlatformAdmin.mockResolvedValue({ context: ADMIN_CTX });
    mockGetState.mockResolvedValue({
      profile: {
        organisation_id: "org-1",
        billing_mode: "manual",
        customer_type: "standard",
        unlock_credits_monthly: 20,
        job_credits_monthly: 5,
        allow_negative_balance: false,
        notes: null,
      },
      wallet: { organisation_id: "org-1", unlock_balance: 10, job_balance: 2 },
    });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [] }),
      upsert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          organisation_id: "org-1",
          billing_mode: "manual",
          customer_type: "startup",
          unlock_credits_monthly: 30,
          job_credits_monthly: 10,
          allow_negative_balance: false,
          notes: null,
        },
        error: null,
      }),
    });
    mockAdjust.mockResolvedValue({ balanceAfter: 12 });
  });

  it("returns 403 when caller is not a platform admin", async () => {
    mockRequirePlatformAdmin.mockResolvedValue({
      error: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    });
    const { GET } = await import("@/app/api/admin/organisations/[id]/billing/route");
    const req = new NextRequest("http://localhost/api/admin/organisations/org-1/billing");
    const res = await GET(req, { params: Promise.resolve({ id: "org-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns billing profile details on GET", async () => {
    const { GET } = await import("@/app/api/admin/organisations/[id]/billing/route");
    const req = new NextRequest("http://localhost/api/admin/organisations/org-1/billing");
    const res = await GET(req, { params: Promise.resolve({ id: "org-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.billing_mode).toBe("manual");
  });

  it("updates billing profile on PATCH", async () => {
    const { PATCH } = await import("@/app/api/admin/organisations/[id]/billing/route");
    const req = new NextRequest("http://localhost/api/admin/organisations/org-1/billing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        billingMode: "manual",
        customerType: "startup",
        unlockCreditsMonthly: 30,
        jobCreditsMonthly: 10,
        allowNegativeBalance: false,
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "org-1" }) });
    expect(res.status).toBe(200);
  });

  it("applies credit mutation on POST credits", async () => {
    const { POST } = await import("@/app/api/admin/organisations/[id]/billing/credits/route");
    const req = new NextRequest("http://localhost/api/admin/organisations/org-1/billing/credits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creditType: "unlock",
        entryType: "grant",
        delta: 5,
        reason: "invoice posted",
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "org-1" }) });
    expect(res.status).toBe(200);
    expect(mockAdjust).toHaveBeenCalled();
  });
});
