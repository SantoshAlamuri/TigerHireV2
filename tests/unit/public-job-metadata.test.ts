import { describe, it, expect, vi } from "vitest";
import {
  buildPublicJobMetadata,
  getPublicJobPageMetadata,
  type PublicJobMetaRow,
} from "@/lib/jobs/public-job-metadata";

// getPublicJobPageMetadata hits Supabase; stub the admin client so the not-found
// branch can be exercised without a database.
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: function eq() {
          return this;
        },
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      }),
    }),
  }),
}));

const job: PublicJobMetaRow = {
  title: "Backend Engineer",
  description: "Build APIs for the hiring platform.",
  location: "Bengaluru",
  city: null,
  organisations: { name: "Acme" },
};

describe("buildPublicJobMetadata", () => {
  it("canonicalizes the primary /jobs URL to itself", () => {
    const m = buildPublicJobMetadata("job-1", job, "/jobs/job-1");
    expect(m.alternates).toEqual({ canonical: "/jobs/job-1" });
  });

  it("canonicalizes the /j short-link to the primary /jobs URL", () => {
    const m = buildPublicJobMetadata("job-1", job, "/j/job-1");
    expect(m.alternates).toEqual({ canonical: "/jobs/job-1" });
  });

  it("keeps title and truncated description", () => {
    const m = buildPublicJobMetadata("job-1", job, "/jobs/job-1");
    expect(m.title).toBe("Backend Engineer · Bengaluru");
    expect(m.description).toBe("Build APIs for the hiring platform.");
  });
});

describe("getPublicJobPageMetadata", () => {
  it("returns noindex 'Job not found' metadata when the job is missing", async () => {
    const m = await getPublicJobPageMetadata("nope", "/jobs/nope");
    expect(m.title).toBe("Job not found");
    expect(m.robots).toEqual({ index: false, follow: false });
  });
});
