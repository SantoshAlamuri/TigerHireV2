import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { companyAdminCtx, candidateCtx, recruiterCtx } from "../helpers";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  parseJsonBody: async (request: Request) => {
    try {
      const body = await request.json();
      return { body, errorResponse: null };
    } catch {
      return {
        body: null,
        errorResponse: new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
        }),
      };
    }
  },
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
  reportError: vi.fn(),
}));

vi.mock("@/lib/security/csrf", () => ({ validateOrigin: () => null }));
vi.mock("@/lib/security/idempotency", () => ({
  withIdempotency: (_req: unknown, _key: string, fn: () => Promise<Response>) => fn(),
}));

const mockCreateCheckoutSession = vi.fn();
const mockGetBillingPlans = vi.fn();
const mockGetProviderPlanId = vi.fn();
const mockCreateBillingPortalSession = vi.fn();
const mockCreateRazorpaySubscriptionCheckout = vi.fn();
vi.mock("@/lib/services/stripe", () => ({
  createCheckoutSession: (...args: unknown[]) => mockCreateCheckoutSession(...args),
  createCustomer: vi.fn().mockResolvedValue({ id: "cus_123" }),
  getBillingPlans: () => mockGetBillingPlans(),
  getProviderPlanId: (...args: unknown[]) => mockGetProviderPlanId(...args),
  createBillingPortalSession: (...args: unknown[]) => mockCreateBillingPortalSession(...args),
}));
vi.mock("@/lib/services/razorpay", () => ({
  createRazorpaySubscriptionCheckout: (...args: unknown[]) =>
    mockCreateRazorpaySubscriptionCheckout(...args),
}));
const mockResolveCheckoutProvider = vi.fn();
vi.mock("@/lib/services/billing-provider", () => ({
  resolveCheckoutProvider: (...args: unknown[]) => mockResolveCheckoutProvider(...args),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      from: (...args: unknown[]) => mockFrom(...args),
      auth: {
        getUser: () =>
          Promise.resolve({
            data: { user: { email: "admin@test.com" } },
            error: null,
          }),
      },
    }),
}));

vi.mock("@/lib/config/env", () => ({ env: { baseUrl: "https://app.test.com" } }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("POST /api/billing/checkout", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockGetBillingPlans.mockReset();
    mockCreateCheckoutSession.mockReset();
    mockGetProviderPlanId.mockReset();
    mockCreateRazorpaySubscriptionCheckout.mockReset();
    mockResolveCheckoutProvider.mockReset();
    mockResolveCheckoutProvider.mockResolvedValue("stripe");
    mockGetProviderPlanId.mockImplementation(
      (plan: { priceId?: string } | undefined, provider: string) =>
        provider === "razorpay" ? "" : (plan?.priceId ?? ""),
    );
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/billing/checkout/route");
    const req = new NextRequest("http://localhost:3000/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "pro", type: "company" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is invalid", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    const { POST } = await import("@/app/api/billing/checkout/route");
    const req = new NextRequest("http://localhost:3000/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "pro" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 403 when non-leadership tries company checkout", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/billing/checkout/route");
    const req = new NextRequest("http://localhost:3000/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "pro", type: "company" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when leadership has no organisationId", async () => {
    mockGetAuthContext.mockResolvedValue({
      ...companyAdminCtx,
      organisationId: null,
    });
    const { POST } = await import("@/app/api/billing/checkout/route");
    const req = new NextRequest("http://localhost:3000/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "pro", type: "company" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when plan is invalid", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    mockGetBillingPlans.mockResolvedValue({ company: {}, candidate: {} });
    const { POST } = await import("@/app/api/billing/checkout/route");
    const req = new NextRequest("http://localhost:3000/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "invalid_plan", type: "company" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("accepts valid company plan and type and proceeds to checkout flow", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    mockGetBillingPlans.mockResolvedValue({
      company: { pro: { priceId: "price_123" } },
      candidate: {},
    });
    mockCreateCheckoutSession.mockResolvedValue({ url: "https://checkout.stripe.com/session/xyz" });
    mockFrom.mockImplementation((table: string) => {
      const base = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(),
        update: vi.fn().mockReturnThis(),
      };
      if (table === "profiles")
        base.single = vi.fn().mockResolvedValue({ data: { full_name: "Admin" }, error: null });
      if (table === "organisations")
        base.single = vi.fn().mockResolvedValue({ data: null, error: null });
      return base;
    });
    const { POST } = await import("@/app/api/billing/checkout/route");
    const req = new NextRequest("http://localhost:3000/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "pro", type: "company" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBeDefined();
  });

  it("accepts valid candidate plan and type for candidate_free", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    mockGetBillingPlans.mockResolvedValue({
      company: {},
      candidate: { pro: { priceId: "price_cand_123" } },
    });
    mockCreateCheckoutSession.mockResolvedValue({ url: "https://checkout.stripe.com/session/abc" });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { full_name: "Candidate" }, error: null }),
    });
    const { POST } = await import("@/app/api/billing/checkout/route");
    const req = new NextRequest("http://localhost:3000/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "pro", type: "candidate" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("uses Razorpay checkout when provider resolves to razorpay", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    mockResolveCheckoutProvider.mockResolvedValue("razorpay");
    mockGetProviderPlanId.mockImplementation(
      (_plan: { priceId?: string; razorpayPlanId?: string }, provider: "stripe" | "razorpay") =>
        provider === "razorpay" ? "plan_razorpay_growth" : "price_123",
    );
    mockGetBillingPlans.mockResolvedValue({
      company: { growth: { priceId: "price_123", razorpayPlanId: "plan_razorpay_growth" } },
      candidate: {},
    });
    mockCreateRazorpaySubscriptionCheckout.mockResolvedValue({
      url: "https://rzp.io/i/subscription",
      subscriptionId: "sub_rzp_123",
      status: "created",
    });

    const { POST } = await import("@/app/api/billing/checkout/route");
    const req = new NextRequest("http://localhost:3000/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "growth", type: "company" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe("razorpay");
    expect(body.url).toContain("rzp.io");
  });
});

describe("POST /api/billing/portal", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockFrom.mockReset();
    mockCreateBillingPortalSession.mockResolvedValue({
      url: "https://billing.stripe.com/session/xyz",
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/billing/portal/route");
    const req = new NextRequest("http://localhost:3000/api/billing/portal", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 404 when no stripe_customer_id for leadership", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { stripe_customer_id: null }, error: null }),
    });
    const { POST } = await import("@/app/api/billing/portal/route");
    const req = new NextRequest("http://localhost:3000/api/billing/portal", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 200 with url when portal session created", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { stripe_customer_id: "cus_123" },
        error: null,
      }),
    });
    mockCreateBillingPortalSession.mockResolvedValue({
      url: "https://billing.stripe.com/session/xyz",
    });
    const { POST } = await import("@/app/api/billing/portal/route");
    const req = new NextRequest("http://localhost:3000/api/billing/portal", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBeDefined();
  });
});
