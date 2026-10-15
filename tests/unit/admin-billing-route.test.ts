import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequirePlatformAdmin = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/security/platform-admin", () => ({
  requirePlatformAdmin: (...args: unknown[]) => mockRequirePlatformAdmin(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

describe("GET /api/admin/billing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 403 when caller is not platform admin", async () => {
    mockRequirePlatformAdmin.mockResolvedValue({
      error: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    });
    const { GET } = await import("@/app/api/admin/billing/route");
    const req = new NextRequest("http://localhost/api/admin/billing");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns provider fields in billing list payload", async () => {
    mockRequirePlatformAdmin.mockResolvedValue({
      context: { userId: "admin-1", isPlatformAdmin: true },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "organisations") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: "org-1",
                name: "Acme",
                slug: "acme",
                type: "company",
                company_plan: "growth",
                stripe_customer_id: null,
                created_at: "2026-05-01T00:00:00.000Z",
              },
            ],
            error: null,
          }),
        };
      }
      if (table === "subscriptions") {
        return {
          select: vi.fn().mockReturnThis(),
          not: vi.fn().mockResolvedValue({
            data: [
              {
                id: "sub-1",
                organisation_id: "org-1",
                status: "active",
                provider: "razorpay",
                provider_customer_id: "cust_rzp_1",
                provider_subscription_id: "sub_rzp_1",
                stripe_subscription_id: null,
              },
            ],
            error: null,
          }),
        };
      }
      if (table === "organisation_billing_profiles") {
        return {
          select: vi.fn().mockResolvedValue({
            data: [
              {
                organisation_id: "org-1",
                billing_mode: "manual",
                customer_type: "enterprise",
                unlock_credits_monthly: 100,
                job_credits_monthly: 10,
                allow_negative_balance: false,
              },
            ],
            error: null,
          }),
        };
      }
      if (table === "organisation_credit_wallets") {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ organisation_id: "org-1", unlock_balance: 12, job_balance: 3 }],
            error: null,
          }),
        };
      }
      if (table === "agency_clients") {
        return {
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === "platform_cost_events") {
        const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
        const costRows = [
          {
            organisation_id: "org-1",
            amount_usd: 0.05,
            occurred_at: recent,
            provider: "anthropic",
            service: "messages",
            metadata: {},
          },
          {
            organisation_id: "org-1",
            amount_usd: 0.02,
            occurred_at: recent,
            provider: "anthropic",
            service: "messages",
            metadata: {},
          },
          {
            organisation_id: null,
            amount_usd: 2.5,
            occurred_at: recent,
            provider: "anthropic",
            service: "cost_report",
            metadata: {},
          },
          {
            organisation_id: "org-1",
            amount_usd: 0.04,
            occurred_at: recent,
            provider: "meta",
            service: "whatsapp",
            metadata: {},
          },
        ];
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockResolvedValue({
            data: costRows,
            error: null,
          }),
        };
      }
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });

    const { GET } = await import("@/app/api/admin/billing/route");
    const req = new NextRequest("http://localhost/api/admin/billing");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.organisations[0].organisation_type).toBe("company");
    expect(body.organisations[0].provider).toBe("razorpay");
    expect(body.organisations[0].provider_subscription_id).toBe("sub_rzp_1");
    expect(body.organisations[0].billing_customer_id).toBe("cust_rzp_1");
    expect(body.organisations[0].anthropic_spend_usd_30d).toBeCloseTo(0.07, 5);
    expect(body.organisations[0].whatsapp_spend_usd_30d).toBeCloseTo(0.04, 5);
    expect(body.organisations[0].bolna_voice_spend_usd_30d).toBeCloseTo(0, 5);
    expect(body.organisations[0].anthropic_spend_usd_30d_ledger_direct).toBeCloseTo(0.07, 5);
    expect(body.organisations[0].anthropic_spend_usd_30d_from_linked_clients).toBeCloseTo(0, 5);
    expect(body.totals.llm_report_months).toHaveLength(24);
    expect(body.totals.llm_ledger_from_iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Array.isArray(body.organisations[0].anthropic_spend_by_month)).toBe(true);
    expect(body.organisations[0].anthropic_spend_by_month.length).toBeGreaterThanOrEqual(1);
    expect(body.totals.main_costs_unassigned?.llm_usd_30d).toBeCloseTo(2.5, 5);
    expect(body.totals.main_costs_unassigned?.whatsapp_usd_30d).toBeCloseTo(0, 5);
  });

  it("attributes client ledger Anthropic spend to linked agency orgs", async () => {
    mockRequirePlatformAdmin.mockResolvedValue({
      context: { userId: "admin-1", isPlatformAdmin: true },
    });

    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    mockFrom.mockImplementation((table: string) => {
      if (table === "organisations") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: "org-client",
                name: "Client Co",
                slug: "client",
                type: "company",
                company_plan: "starter",
                stripe_customer_id: null,
                created_at: "2026-05-01T00:00:00.000Z",
              },
              {
                id: "org-agency",
                name: "Agency Inc",
                slug: "agency",
                type: "agency",
                company_plan: "starter",
                stripe_customer_id: null,
                created_at: "2026-05-01T00:00:00.000Z",
              },
            ],
            error: null,
          }),
        };
      }
      if (table === "agency_clients") {
        return {
          select: vi.fn().mockResolvedValue({
            data: [
              {
                agency_organisation_id: "org-agency",
                client_organisation_id: "org-client",
                is_active: true,
              },
            ],
            error: null,
          }),
        };
      }
      if (table === "subscriptions") {
        return {
          select: vi.fn().mockReturnThis(),
          not: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === "organisation_billing_profiles") {
        return {
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === "organisation_credit_wallets") {
        return {
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === "platform_cost_events") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockResolvedValue({
            data: [
              {
                organisation_id: "org-client",
                amount_usd: 0.12,
                occurred_at: recent,
                provider: "anthropic",
                service: "messages",
                metadata: {},
              },
            ],
            error: null,
          }),
        };
      }
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });

    const { GET } = await import("@/app/api/admin/billing/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/billing"));
    expect(res.status).toBe(200);
    const body = await res.json();
    const client = body.organisations.find((o: { id: string }) => o.id === "org-client");
    const agency = body.organisations.find((o: { id: string }) => o.id === "org-agency");
    expect(client.anthropic_spend_usd_30d).toBeCloseTo(0.12, 5);
    expect(client.anthropic_spend_usd_30d_from_linked_clients).toBeCloseTo(0, 5);
    expect(agency.anthropic_spend_usd_30d).toBeCloseTo(0.12, 5);
    expect(agency.anthropic_spend_usd_30d_ledger_direct).toBeCloseTo(0, 5);
    expect(agency.anthropic_spend_usd_30d_from_linked_clients).toBeCloseTo(0.12, 5);
  });
});
