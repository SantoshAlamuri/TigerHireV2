import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx != null,
  parseJsonBody: async (request: Request) => {
    const body = await request.json();
    return { body, errorResponse: null };
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
  handleZodError: (err: { issues: Array<{ message: string }> }) =>
    new Response(JSON.stringify({ error: err.issues.map((i) => i.message).join("; ") }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: () => Promise.resolve({ allowed: true }),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/referrers/normalize-whatsapp", () => ({
  normalizeReferrerWhatsapp: (s: string) => s.replace(/\D/g, ""),
}));

const mockSupabase = { from: vi.fn() };
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockSupabase,
}));

const updatePayloads: Array<Record<string, unknown>> = [];

/**
 * A referrers query/mutation builder. `rowsByField` maps the first `.eq(col,…)`
 * column to the row `.maybeSingle()` resolves — lets one mock serve both the
 * `user_id` lookup (authReferrer) and the `whatsapp_number` lookup (existing).
 */
function referrersBuilder(rowsByField: Record<string, unknown>) {
  let field: string | null = null;
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.insert = vi.fn(() => {
    field = "__insert__";
    return builder;
  });
  builder.update = vi.fn((payload: Record<string, unknown>) => {
    updatePayloads.push(payload);
    return builder;
  });
  builder.eq = vi.fn((col: string) => {
    if (field === null) field = col;
    return builder;
  });
  builder.maybeSingle = vi.fn(() =>
    Promise.resolve({ data: field ? (rowsByField[field] ?? null) : null, error: null }),
  );
  builder.single = vi.fn(() => Promise.resolve({ data: { id: "updated-ref" }, error: null }));
  return builder;
}

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/refer/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  name: "Attacker",
  whatsapp_number: "+91 98111 22222",
  type: "individual" as const,
};

describe("POST /api/refer/join — account-takeover guards", () => {
  beforeEach(() => {
    updatePayloads.length = 0;
    mockGetAuthContext.mockReset();
    mockSupabase.from.mockReset();
  });

  it("409s when the WhatsApp number belongs to a verified referrer, without mutating it", async () => {
    mockGetAuthContext.mockResolvedValue(null); // anonymous
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "referrers")
        return referrersBuilder({
          whatsapp_number: {
            id: "victim-ref",
            parent_referrer_id: null,
            user_id: null,
            whatsapp_verified: true,
          },
        });
      throw new Error(`unexpected table ${table}`);
    });

    const { POST } = await import("@/app/api/refer/join/route");
    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(409);
    expect(updatePayloads).toHaveLength(0);
  });

  it("409s when the WhatsApp number is already owned (user_id set), without mutating it", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "referrers")
        return referrersBuilder({
          whatsapp_number: {
            id: "victim-ref",
            parent_referrer_id: null,
            user_id: "victim-user",
            whatsapp_verified: false,
          },
        });
      throw new Error(`unexpected table ${table}`);
    });

    const { POST } = await import("@/app/api/refer/join/route");
    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(409);
    expect(updatePayloads).toHaveLength(0);
  });

  it("never writes user_id when an authenticated caller upserts an unclaimed referrer by number", async () => {
    mockGetAuthContext.mockResolvedValue({ userId: "attacker-user" });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "referrers")
        return referrersBuilder({
          // authReferrer lookup by user_id → attacker owns no referrer
          user_id: null,
          // existing lookup by number → an unclaimed, unverified row
          whatsapp_number: {
            id: "unclaimed-ref",
            parent_referrer_id: null,
            user_id: null,
            whatsapp_verified: false,
          },
        });
      throw new Error(`unexpected table ${table}`);
    });

    const { POST } = await import("@/app/api/refer/join/route");
    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    expect(updatePayloads.length).toBeGreaterThan(0);
    for (const payload of updatePayloads) {
      expect(payload).not.toHaveProperty("user_id");
    }
  });
});
