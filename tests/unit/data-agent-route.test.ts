import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

// Shared, hoisted mock state so the vi.mock factories can read it.
const h = vi.hoisted(() => ({
  authCtx: null as null | {
    userId: string;
    role: string;
    organisationId: string | null;
    isActive?: boolean;
  },
  inserts: [] as Array<{ table: string; payload: unknown }>,
  tables: {} as Record<string, Array<Record<string, unknown>>>,
}));

vi.mock("@/lib/security/csrf", () => ({ validateOrigin: () => null }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/redis/auth-profile-cache", () => ({
  getCachedAuthProfile: vi.fn(),
  setCachedAuthProfile: vi.fn(),
}));

// Fake Anthropic: routes to candidates_by_source, then phrases.
vi.mock("@/lib/services/anthropic", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: vi.fn(async (params: { tool_choice?: { type: string } }) => {
        if (params.tool_choice?.type === "none") {
          return { content: [{ type: "text", text: "Most candidates came from linkedin." }] };
        }
        return {
          content: [{ type: "tool_use", id: "toolu_1", name: "candidates_by_source", input: {} }],
        };
      }),
    },
  }),
  ANTHROPIC_CREDIT_ERROR_MESSAGE:
    "Your API credit balance is too low. Please go to Plans & Billing to add credits.",
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => {
    const from = (table: string) => {
      let rows = [...(h.tables[table] ?? [])];
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.order = () => b;
      b.limit = () => b;
      b.eq = (col: string, val: unknown) => {
        rows = rows.filter((r) => r[col] === val);
        return b;
      };
      b.insert = (payload: unknown) => {
        h.inserts.push({ table, payload });
        return { then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }) };
      };
      b.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
      return b;
    };
    return { from } as unknown as SupabaseClient;
  }),
}));

vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-helpers")>();
  return { ...actual, getAuthContext: vi.fn(async () => h.authCtx) };
});

import { POST } from "@/app/api/agents/data/route";

function makeReq(body: unknown): NextRequest {
  return new Request("http://localhost/api/agents/data", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  h.authCtx = { userId: "user-1", role: "recruiter", organisationId: "org-1", isActive: true };
  h.inserts.length = 0;
  h.tables = { analytics_candidates_by_source: [{ source: "linkedin", candidate_count: 7 }] };
});

describe("POST /api/agents/data", () => {
  it("answers and writes exactly one audit row for the turn", async () => {
    const res = await POST(makeReq({ question: "where do candidates come from?" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.rejected).toBe(false);
    expect(body.meta.tool).toBe("candidates_by_source");
    expect(body.artifact.type).toBe("source_bars");

    const logRows = h.inserts.filter((i) => i.table === "agent_query_log");
    expect(logRows).toHaveLength(1);
    const payload = logRows[0].payload as Record<string, unknown>;
    expect(payload.tool).toBe("candidates_by_source");
    expect(payload.organisation_id).toBe("org-1");
    expect(payload.user_id).toBe("user-1");
    expect(payload.row_count).toBe(1);
  });

  it("403s a candidate role and writes nothing", async () => {
    h.authCtx = { userId: "c-1", role: "candidate_free", organisationId: null, isActive: true };
    const res = await POST(makeReq({ question: "..." }));
    expect(res.status).toBe(403);
    expect(h.inserts).toHaveLength(0);
  });

  it("400s an org-less account and writes nothing", async () => {
    h.authCtx = { userId: "u-2", role: "recruiter", organisationId: null, isActive: true };
    const res = await POST(makeReq({ question: "..." }));
    expect(res.status).toBe(400);
    expect(h.inserts).toHaveLength(0);
  });

  it("401s when unauthenticated", async () => {
    h.authCtx = null;
    const res = await POST(makeReq({ question: "..." }));
    expect(res.status).toBe(401);
  });
});
