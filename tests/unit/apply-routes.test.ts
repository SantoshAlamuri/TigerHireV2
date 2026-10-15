/** Node env: jsdom FormData + NextRequest multipart fails when both text fields and `File` are present. */
// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from "vitest";
import { File as NodeFile } from "node:buffer";
import { NextRequest } from "next/server";
import { createMockQueryBuilder } from "../helpers";

vi.mock("@/lib/security/csrf", () => ({ validateOrigin: () => null }));

const mockAdminFrom = vi.fn();
const mockAdminSupabase = {
  from: (...args: unknown[]) => mockAdminFrom(...args),
};
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockAdminSupabase,
}));

const mockGetBySlug = vi.fn();
vi.mock("@/lib/repositories/OrganisationRepository", () => ({
  OrganisationRepository: {
    getBySlug: (...args: unknown[]) => mockGetBySlug(...args),
  },
}));

const mockProcessPublicApplication = vi.fn();
vi.mock("@/lib/agents/public-apply", () => ({
  processPublicApplication: (...args: unknown[]) => mockProcessPublicApplication(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: vi.fn(),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  RATE_LIMIT_PRESETS: { apply: { limit: 20, windowSecs: 60 } },
}));

/** Node's `File` satisfies undici's multipart parser; jsdom `File` does not. */
function fakeFile(name: string, size: number, type: string): File {
  return new NodeFile([new Uint8Array(size)], name, { type });
}

/** Node `File` so undici’s multipart parser accepts the upload part. */
function buildApplyPostRequest(fields: Record<string, unknown>): NextRequest {
  const fd = new FormData();
  if (fields.slug != null) fd.set("slug", String(fields.slug));
  if (fields.jobId) fd.set("jobId", String(fields.jobId));
  if (fields.name) fd.set("name", String(fields.name));
  if (fields.phone) fd.set("phone", String(fields.phone));
  if (fields.email) fd.set("email", String(fields.email));
  if (fields.source) fd.set("source", String(fields.source));
  if (fields.file != null) fd.set("file", fields.file as File);
  return new NextRequest("http://localhost:3000/api/apply", {
    method: "POST",
    body: fd,
  });
}

// ---------------------------------------------------------------------------
// POST /api/apply
// ---------------------------------------------------------------------------
describe("POST /api/apply", () => {
  beforeEach(() => {
    mockGetBySlug.mockReset();
    mockProcessPublicApplication.mockReset();
  });

  it("returns 400 when no file uploaded", async () => {
    const { POST } = await import("@/app/api/apply/route");
    const req = buildApplyPostRequest({ slug: "acme" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("resume");
  }, 15000);

  it("returns 400 when slug is missing", async () => {
    const { POST } = await import("@/app/api/apply/route");
    const req = buildApplyPostRequest({
      file: fakeFile("resume.pdf", 100, "application/pdf"),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Organisation");
  });

  it("returns 400 when file is too large", async () => {
    const { POST } = await import("@/app/api/apply/route");
    const req = buildApplyPostRequest({
      file: fakeFile("big.pdf", 11 * 1024 * 1024, "application/pdf"),
      slug: "acme",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("large");
  });

  it("returns 400 for unsupported file type", async () => {
    const { POST } = await import("@/app/api/apply/route");
    const req = buildApplyPostRequest({
      file: fakeFile("resume.txt", 100, "text/plain"),
      slug: "acme",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("PDF or Word");
  });

  it("returns 404 when company not found", async () => {
    mockGetBySlug.mockResolvedValue(null);
    const { POST } = await import("@/app/api/apply/route");
    const req = buildApplyPostRequest({
      file: fakeFile("resume.pdf", 100, "application/pdf"),
      slug: "nonexistent",
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 200 on successful application", async () => {
    mockGetBySlug.mockResolvedValue({
      id: "org-1",
      name: "Acme",
      slug: "acme",
    });
    mockProcessPublicApplication.mockResolvedValue({
      candidateName: "Jane Doe",
      jobsScored: 3,
      topScore: 85,
    });

    const { POST } = await import("@/app/api/apply/route");
    const req = buildApplyPostRequest({
      file: fakeFile("resume.pdf", 100, "application/pdf"),
      slug: "acme",
      name: "Jane Doe",
      phone: "+919876543210",
      email: "jane@test.com",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.candidateName).toBe("Jane Doe");
    expect(body.jobsScored).toBe(3);
    expect(body.status).toBe("scored");
    expect(body.parsingPending).toBe(false);
    expect(body.noOpenJobs).toBe(false);
    expect(body.scoringFailed).toBe(false);
  });

  it("returns status processing when parsing is pending", async () => {
    mockGetBySlug.mockResolvedValue({
      id: "org-1",
      name: "Acme",
      slug: "acme",
    });
    mockProcessPublicApplication.mockResolvedValue({
      candidateName: "Pat",
      jobsScored: 0,
      topScore: null,
      parsingPending: true,
    });

    const { POST } = await import("@/app/api/apply/route");
    const req = buildApplyPostRequest({
      file: fakeFile("resume.pdf", 100, "application/pdf"),
      slug: "acme",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("processing");
    expect(body.parsingPending).toBe(true);
  });

  it("returns 500 when processing throws", async () => {
    mockGetBySlug.mockResolvedValue({
      id: "org-1",
      name: "Acme",
      slug: "acme",
    });
    mockProcessPublicApplication.mockRejectedValue(new Error("AI fail"));

    const { POST } = await import("@/app/api/apply/route");
    const req = buildApplyPostRequest({
      file: fakeFile("resume.pdf", 100, "application/pdf"),
      slug: "acme",
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/apply/[slug]
// ---------------------------------------------------------------------------
describe("GET /api/apply/[slug]", () => {
  beforeEach(() => {
    mockGetBySlug.mockReset();
    mockAdminFrom.mockReset();
  });

  it("returns 404 when organisation not found", async () => {
    mockGetBySlug.mockResolvedValue(null);
    const { GET } = await import("@/app/api/apply/[slug]/route");
    const req = new Request("http://localhost:3000/api/apply/missing");
    const res = await GET(req as any, {
      params: Promise.resolve({ slug: "missing" }),
    });
    expect(res.status).toBe(404);
  }, 15000);

  it("returns only active public open jobs for the organisation", async () => {
    mockGetBySlug.mockResolvedValue({
      id: "org-1",
      name: "Acme",
      slug: "acme",
    });
    const jobBuilder = createMockQueryBuilder({
      data: [
        {
          id: "j1",
          title: "Engineer",
          show_salary: true,
          location: "Remote",
          compensation_min: 50000,
          compensation_max: 80000,
          created_at: "2025-01-01",
        },
      ],
    });
    mockAdminFrom.mockReturnValue(jobBuilder);

    const { GET } = await import("@/app/api/apply/[slug]/route");
    const req = new Request("http://localhost:3000/api/apply/acme");
    const res = await GET(req as any, {
      params: Promise.resolve({ slug: "acme" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.organisation.name).toBe("Acme");
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0].compensation_min).toBe(50000);
    expect(body.jobs[0].compensation_max).toBe(80000);
    expect(jobBuilder.eq).toHaveBeenCalledWith("organisation_id", "org-1");
    expect(jobBuilder.eq).toHaveBeenCalledWith("status", "open");
    expect(jobBuilder.eq).toHaveBeenCalledWith("list_on_public_job_board", true);
    expect(jobBuilder.eq).toHaveBeenCalledWith("is_active", true);
  });

  it.each([false, null, undefined])(
    "hides compensation unless explicitly visible (show_salary=%s)",
    async (showSalary) => {
      mockGetBySlug.mockResolvedValue({ id: "org-1", name: "Acme", slug: "acme" });
      mockAdminFrom.mockReturnValue(
        createMockQueryBuilder({
          data: [
            {
              id: "j1",
              title: "Engineer",
              show_salary: showSalary,
              compensation_min: 50000,
              compensation_max: 80000,
            },
          ],
        }),
      );
      const { GET } = await import("@/app/api/apply/[slug]/route");
      const response = await GET(new NextRequest("http://localhost:3000/api/apply/acme"), {
        params: Promise.resolve({ slug: "acme" }),
      });
      expect(response.status).toBe(200);
      expect((await response.json()).jobs[0]).toEqual({
        id: "j1",
        title: "Engineer",
        compensation_min: null,
        compensation_max: null,
      });
    },
  );

  it("returns empty jobs array when no open jobs", async () => {
    mockGetBySlug.mockResolvedValue({
      id: "org-1",
      name: "Acme",
      slug: "acme",
    });
    const jobBuilder = createMockQueryBuilder({ data: null });
    mockAdminFrom.mockReturnValue(jobBuilder);

    const { GET } = await import("@/app/api/apply/[slug]/route");
    const req = new Request("http://localhost:3000/api/apply/acme");
    const res = await GET(req as any, {
      params: Promise.resolve({ slug: "acme" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs).toEqual([]);
  });
});
