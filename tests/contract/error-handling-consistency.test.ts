import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, recruiterCtx, candidateCtx } from "../helpers";

/* ------------------------------------------------------------------ */
/*  Shared mocks                                                       */
/* ------------------------------------------------------------------ */

const mockGetAuthContext = vi.fn();

vi.mock("@/lib/api-helpers", async () => {
  // Import the real module to test actual error formatting behaviour
  const actual = await vi.importActual<typeof import("@/lib/api-helpers")>("@/lib/api-helpers");
  return {
    ...actual,
    getAuthContext: () => mockGetAuthContext(),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(createMockSupabase()),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: vi.fn(),
}));

vi.mock("@/lib/observability/correlation", () => ({
  getCorrelationId: vi.fn().mockReturnValue("test-correlation-id"),
}));

vi.mock("@/lib/redis/auth-profile-cache", () => ({
  getCachedAuthProfile: vi.fn().mockResolvedValue(null),
  setCachedAuthProfile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/services/CandidateService", () => ({
  CandidateService: {
    listMasked: vi.fn().mockRejectedValue(new Error("DB connection failed")),
    getByUserId: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("@/lib/repositories/CandidateRepository", () => ({
  getAccessibleCandidateIdsForOrgs: vi.fn().mockResolvedValue([]),
  CandidateRepository: {},
}));

vi.mock("@/lib/services/JobService", () => ({
  JobService: {
    list: vi.fn().mockRejectedValue(new Error("Query timeout")),
    create: vi.fn().mockRejectedValue(new Error("Constraint violation")),
  },
}));

vi.mock("@/lib/services/ApplicationService", () => ({
  ApplicationService: {
    listForCandidate: vi.fn().mockRejectedValue(new Error("Internal error")),
    listForRecruiter: vi.fn().mockRejectedValue(new Error("Internal error")),
  },
}));

vi.mock("@/lib/redis/job-cache", () => ({
  getCachedJobList: vi.fn().mockResolvedValue(null),
  setCachedJobList: vi.fn().mockResolvedValue(undefined),
  invalidateJobCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/observability/with-correlation", () => ({
  withCorrelation: (fn: Function) => fn,
}));

vi.mock("@/lib/observability/route-span", () => ({
  withRouteSpan: (_name: string, fn: Function) => fn(),
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueue: vi.fn().mockResolvedValue({ id: "q1" }),
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function parseResponse(res: Response) {
  const text = await res.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(text);
  } catch {
    // intentionally left empty — body stays null
  }
  return {
    body,
    text,
    status: res.status,
    contentType: res.headers.get("Content-Type"),
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Error Handling Consistency", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
    // Ensure NODE_ENV is production so handleApiError does NOT leak detail
    vi.stubEnv("NODE_ENV", "production");
  });

  /* ---- JSON format ---- */

  describe("All error responses are valid JSON", () => {
    it("401 error is valid JSON", async () => {
      mockGetAuthContext.mockResolvedValue(null);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(new Request("http://localhost/api/candidates") as any);
      const { body } = await parseResponse(res);

      expect(body).not.toBeNull();
      expect(typeof body).toBe("object");
    });

    it("403 error is valid JSON", async () => {
      mockGetAuthContext.mockResolvedValue(candidateCtx);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(new Request("http://localhost/api/candidates") as any);
      const { body } = await parseResponse(res);

      expect(body).not.toBeNull();
      expect(typeof body).toBe("object");
    });

    it("422 validation error is valid JSON", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(new Request("http://localhost/api/candidates?sortBy=BAD") as any);
      const { body } = await parseResponse(res);

      expect(body).not.toBeNull();
      expect(typeof body).toBe("object");
    });

    it("500 internal error is valid JSON", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(new Request("http://localhost/api/candidates") as any);
      const { body, status } = await parseResponse(res);

      expect(status).toBe(500);
      expect(body).not.toBeNull();
      expect(typeof body).toBe("object");
    });
  });

  /* ---- Content-Type ---- */

  describe("All error responses have Content-Type: application/json", () => {
    it("401 has application/json content type", async () => {
      mockGetAuthContext.mockResolvedValue(null);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(new Request("http://localhost/api/candidates") as any);

      expect(res.headers.get("content-type")).toContain("application/json");
    });

    it("422 has application/json content type", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(new Request("http://localhost/api/candidates?page=abc") as any);

      expect(res.headers.get("content-type")).toContain("application/json");
    });

    it("500 has application/json content type", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(new Request("http://localhost/api/candidates") as any);

      expect(res.headers.get("content-type")).toContain("application/json");
    });
  });

  /* ---- No stack trace leaking ---- */

  describe("500 errors do not leak implementation details in production", () => {
    it("500 error does not contain stack traces", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(new Request("http://localhost/api/candidates") as any);
      const { text } = await parseResponse(res);

      expect(text).not.toContain("at Object.");
      expect(text).not.toContain("at Module.");
      expect(text).not.toContain("at Function.");
      expect(text).not.toContain(".ts:");
      expect(text).not.toContain(".js:");
    });

    it("500 error does not leak database table names", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(new Request("http://localhost/api/candidates") as any);
      const { text } = await parseResponse(res);

      // The generic message should be used, not raw DB error details
      expect(text).not.toContain("relation");
      expect(text).not.toContain("pg_");
      expect(text).not.toContain("SELECT");
      expect(text).not.toContain("INSERT");
    });

    it("500 error does not expose connection strings", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(new Request("http://localhost/api/candidates") as any);
      const { text } = await parseResponse(res);

      expect(text).not.toContain("postgresql://");
      expect(text).not.toContain("postgres://");
      expect(text).not.toContain("supabase");
    });

    it("500 error uses generic user-facing message", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(new Request("http://localhost/api/candidates") as any);
      const { body } = await parseResponse(res);

      expect(body).toHaveProperty("error");
      // The message should be the generic one from the route, not the raw exception
      expect(body!.error).toBe("Failed to fetch candidates");
    });
  });

  /* ---- Consistent error shape ---- */

  describe("All error responses have consistent { error: string } shape", () => {
    it("401 response shape", async () => {
      mockGetAuthContext.mockResolvedValue(null);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(new Request("http://localhost/api/candidates") as any);
      const { body } = await parseResponse(res);

      expect(body).toHaveProperty("error");
      expect(typeof body!.error).toBe("string");
      expect(Object.keys(body!)).toContain("error");
    });

    it("422 response shape", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(new Request("http://localhost/api/candidates?sortBy=WRONG") as any);
      const { body } = await parseResponse(res);

      expect(body).toHaveProperty("error");
      expect(typeof body!.error).toBe("string");
    });

    it("500 response shape (production mode)", async () => {
      mockGetAuthContext.mockResolvedValue(recruiterCtx);
      const { GET } = await import("@/app/api/candidates/route");
      const res = await GET(new Request("http://localhost/api/candidates") as any);
      const { body } = await parseResponse(res);

      expect(body).toHaveProperty("error");
      expect(typeof body!.error).toBe("string");
      // In production, handleApiError should NOT include `detail`
      expect(body).not.toHaveProperty("detail");
    });
  });

  /* ---- handleApiError / jsonError unit contract ---- */

  describe("jsonError and handleApiError produce correct shapes", () => {
    it("jsonError returns { error } with correct status", async () => {
      const { jsonError } = await import("@/lib/api-helpers");
      const res = jsonError("Something went wrong", 400);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toEqual({ error: "Something went wrong" });
    });

    it("jsonError defaults to 400 when no status given", async () => {
      const { jsonError } = await import("@/lib/api-helpers");
      const res = jsonError("Bad request");

      expect(res.status).toBe(400);
    });

    it("handleApiError returns 500 with generic message in production", async () => {
      const { handleApiError } = await import("@/lib/api-helpers");
      const res = handleApiError(new Error("Secret internal detail"), "Something failed");

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Something failed");
      expect(body).not.toHaveProperty("detail");
    });

    it("handleApiError includes detail in development mode", async () => {
      vi.stubEnv("NODE_ENV", "development");
      // Re-import to pick up new env
      vi.resetModules();
      const { handleApiError } = await import("@/lib/api-helpers");
      const res = handleApiError(new Error("Detailed error message"), "Something failed");

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Something failed");
      expect(body.detail).toBe("Detailed error message");
    });

    it("handleZodError returns 422 with joined messages", async () => {
      const { handleZodError } = await import("@/lib/api-helpers");
      const { z } = await import("zod");

      const schema = z.object({
        name: z.string().min(2, "Name too short"),
        age: z.number().min(0, "Age must be positive"),
      });

      const result = schema.safeParse({ name: "A", age: -1 });
      if (!result.success) {
        const res = handleZodError(result.error);
        expect(res.status).toBe(422);
        const body = await res.json();
        expect(body).toHaveProperty("error");
        expect(typeof body.error).toBe("string");
        expect(body.error).toContain("Name too short");
        expect(body.error).toContain("Age must be positive");
      }
    });
  });

  /* ---- 404 errors use consistent message format ---- */

  describe("404 errors use consistent message format", () => {
    it("jsonError can produce 404 with a message", async () => {
      const { jsonError } = await import("@/lib/api-helpers");
      const res = jsonError("Not found", 404);

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({ error: "Not found" });
    });

    it("404 shape matches other error shapes", async () => {
      const { jsonError } = await import("@/lib/api-helpers");
      const res404 = jsonError("Resource not found", 404);
      const res401 = jsonError("Unauthorized", 401);

      const body404 = await res404.json();
      const body401 = await res401.json();

      // Both have the same key set
      expect(Object.keys(body404)).toEqual(Object.keys(body401));
      expect(Object.keys(body404)).toEqual(["error"]);
    });
  });
});
