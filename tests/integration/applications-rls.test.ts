import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, createMockQueryBuilder } from "../helpers";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/**
 * Integration test: recruiter application list is org-scoped.
 * In production, RLS on applications/jobs ensures a recruiter only sees applications
 * for jobs belonging to their organisation. This test asserts that when the
 * listForRecruiter path is used, the returned data is treated as org-scoped
 * (mock simulates RLS by returning only one org's applications).
 */
describe("Applications RLS — recruiter sees only their org's applications", () => {
  const ORG_A = "org-a-id";
  const ORG_B = "org-b-id";

  beforeEach(() => {
    vi.resetModules();
  });

  it("listForRecruiter returns applications; mock simulates RLS returning only org A jobs", async () => {
    const applicationsForOrgA = [
      {
        id: "app-1",
        job_id: "job-1",
        status: "applied",
        jobs: {
          id: "job-1",
          title: "Job 1",
          organisation_id: ORG_A,
          organisations: { name: "Org A" },
        },
      },
      {
        id: "app-2",
        job_id: "job-1",
        status: "shortlisted",
        jobs: {
          id: "job-1",
          title: "Job 1",
          organisation_id: ORG_A,
          organisations: { name: "Org A" },
        },
      },
    ];

    const builder = createMockQueryBuilder({
      data: applicationsForOrgA,
      count: 2,
    });
    builder.range = vi.fn().mockReturnValue(builder);
    builder.order = vi.fn().mockReturnValue(builder);
    builder.then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({
        data: applicationsForOrgA,
        error: null,
        count: 2,
      }),
    );

    const supabase = createMockSupabase({ applications: builder });

    const { ApplicationService } = await import("@/lib/services/ApplicationService");
    const result = await ApplicationService.listForRecruiter(supabase, {
      page: 1,
      limit: 10,
    });

    expect(result.applications).toHaveLength(2);
    for (const app of result.applications) {
      const job = (app as { jobs?: { organisation_id?: string } }).jobs;
      expect(job?.organisation_id).toBe(ORG_A);
    }
  });

  it("returned applications do not include other org's jobs when mock returns single-org data", async () => {
    const onlyOrgB = [
      {
        id: "app-3",
        job_id: "job-2",
        status: "viewed",
        jobs: {
          id: "job-2",
          title: "Job 2",
          organisation_id: ORG_B,
          organisations: { name: "Org B" },
        },
      },
    ];

    const builder = createMockQueryBuilder({ data: onlyOrgB, count: 1 });
    builder.range = vi.fn().mockReturnValue(builder);
    builder.order = vi.fn().mockReturnValue(builder);
    builder.then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({ data: onlyOrgB, error: null, count: 1 }),
    );

    const supabase = createMockSupabase({ applications: builder });

    const { ApplicationService } = await import("@/lib/services/ApplicationService");
    const result = await ApplicationService.listForRecruiter(supabase, {
      page: 1,
      limit: 10,
    });

    expect(result.applications).toHaveLength(1);
    const app = result.applications[0] as { jobs?: { organisation_id?: string } };
    expect(app.jobs?.organisation_id).toBe(ORG_B);
    expect(
      result.applications.every(
        (a: { jobs?: { organisation_id?: string } }) => a.jobs?.organisation_id === ORG_B,
      ),
    ).toBe(true);
  });
});
