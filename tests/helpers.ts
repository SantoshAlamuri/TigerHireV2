import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Chainable Supabase query builder mock. Each query method returns `this`
 * so callers can chain freely (`.from().select().eq().single()`).
 * Resolve the chain via `.single()`, `.maybeSingle()`, or by awaiting the builder.
 */
export function createMockQueryBuilder(
  overrides: {
    data?: unknown;
    error?: unknown;
    count?: number;
  } = {},
) {
  const { data = null, error = null, count = 0 } = overrides;
  const result = { data, error, count };

  const builder: Record<string, unknown> = {};
  const chainMethods = [
    "select",
    "insert",
    "update",
    "upsert",
    "delete",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "in",
    "is",
    "or",
    "not",
    "ilike",
    "overlaps",
    "order",
    "limit",
    "range",
    "head",
    "csv",
  ];

  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }

  builder.single = vi.fn().mockResolvedValue(result);
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  builder.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));

  return builder;
}

/**
 * Build a mock Supabase client. Every `.from("table")` call returns the
 * same chainable query builder by default, or per-table builders if supplied.
 */
export function createMockSupabase(
  tableBuilders: Record<string, ReturnType<typeof createMockQueryBuilder>> = {},
  defaultBuilder?: ReturnType<typeof createMockQueryBuilder>,
) {
  const fallback = defaultBuilder ?? createMockQueryBuilder();

  const supabase = {
    from: vi.fn((table: string) => tableBuilders[table] ?? fallback),
    rpc: vi.fn().mockResolvedValue({
      data: [
        {
          pair_count: 0,
          unique_candidate_count: 0,
          strong_match_count: 0,
          avg_overall: null,
        },
      ],
      error: null,
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      admin: { getUserById: vi.fn() },
    },
    rpc: vi.fn().mockResolvedValue({ data: { allowed: true, remaining: 10 }, error: null }),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: "test.pdf" }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: "https://example.com/test.pdf" },
        }),
        remove: vi.fn().mockResolvedValue({ data: null, error: null }),
        list: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    },
  } as unknown as SupabaseClient;

  return supabase;
}

export interface MockAuthContext {
  userId: string;
  role: string;
  organisationId: string | null;
}

export const recruiterCtx: MockAuthContext = {
  userId: "user-recruiter-1",
  role: "recruiter",
  organisationId: "org-1",
};

export const companyAdminCtx: MockAuthContext = {
  userId: "user-admin-1",
  role: "leadership",
  organisationId: "org-1",
};

export const candidateCtx: MockAuthContext = {
  userId: "user-candidate-1",
  role: "candidate_free",
  organisationId: null,
};

export const superAdminCtx: MockAuthContext = {
  userId: "user-super-1",
  role: "super_admin",
  organisationId: null,
};

export const hiringManagerCtx: MockAuthContext = {
  userId: "user-hm-1",
  role: "hiring_manager",
  organisationId: "org-1",
};

export const agencyCtx: MockAuthContext = {
  userId: "user-agency-1",
  role: "agency",
  organisationId: "org-agency-1",
};

/** Build a Request object for testing API route handlers. */
export function buildRequest(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  const { method = "GET", body, headers = {} } = options;
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

/** UUID v4 look-alike for tests. */
export function fakeUuid(suffix = "0000") {
  return `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
}

/** Tenant-scoped DB handle returned by `getTenantScopedClient` in route tests. */
export function createTenantScopedClientMock(raw?: ReturnType<typeof createMockSupabase>) {
  const rawClient = raw ?? createMockSupabase();
  return {
    raw: rawClient,
    context: { accessibleOrganisationIds: ["org-1"] },
    assertJobAccess: vi.fn().mockResolvedValue({
      job: { id: "job-1", organisation_id: "org-1" },
    }),
    assertApplicationAccess: vi.fn().mockResolvedValue(undefined),
    organisations: vi.fn(() => createMockQueryBuilder()),
  };
}

/** JSON response helpers for `vi.mock("@/lib/api-helpers", ...)`. */
export const mockApiHelperJsonHandlers = {
  parseJsonBody: async (request: Request) => {
    try {
      const body = await request.json();
      return { body, errorResponse: null };
    } catch {
      return {
        body: null,
        errorResponse: new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
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
  handleZodError: (err: { issues: Array<{ message: string }> }) =>
    new Response(
      JSON.stringify({
        error: err.issues.map((e: { message: string }) => e.message).join("; "),
      }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    ),
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
};
