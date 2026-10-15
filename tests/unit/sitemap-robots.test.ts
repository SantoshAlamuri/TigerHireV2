import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAdmin = { from: vi.fn() };
const createSupabaseAdmin = vi.fn(() => mockAdmin);
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => createSupabaseAdmin(),
}));

const hiddenPublicJobOrgSlugs: string[] = [];
vi.mock("@/lib/config/env", () => ({
  env: {
    get hiddenPublicJobOrgSlugs() {
      return hiddenPublicJobOrgSlugs;
    },
  },
}));

const warnSpy = vi.fn();
vi.mock("@/lib/observability/logger", () => ({
  logger: { warn: (...args: unknown[]) => warnSpy(...args), info: vi.fn(), error: vi.fn() },
}));

/**
 * Chainable jobs query builder; the terminal `.order()` resolves rows/error,
 * matching how the sitemap awaits the query.
 */
function jobsBuilder(rows: Array<Record<string, unknown>>, error: unknown = null) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of ["select", "eq", "or", "not", "in", "limit"]) {
    builder[m] = vi.fn(chain);
  }
  builder.order = vi.fn(() => Promise.resolve({ data: error ? null : rows, error }));
  return builder;
}

async function loadSitemap() {
  const mod = await import("@/app/sitemap");
  return mod.default;
}

describe("sitemap()", () => {
  beforeEach(() => {
    mockAdmin.from.mockReset();
    createSupabaseAdmin.mockClear();
    createSupabaseAdmin.mockImplementation(() => mockAdmin);
    warnSpy.mockReset();
    hiddenPublicJobOrgSlugs.length = 0;
  });

  it("appends TigerHire-owned public jobs and blog posts after the static routes", async () => {
    const builder = jobsBuilder([
      {
        id: "job-1",
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-02T00:00:00Z",
        posted_at: "2026-08-01T12:00:00Z",
      },
      { id: "job-2", created_at: "2026-07-01T00:00:00Z", updated_at: null, posted_at: null },
    ]);
    mockAdmin.from.mockReturnValue(builder);

    const sitemap = await loadSitemap();
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    // Static routes survive untouched.
    expect(urls).toContain("https://tigerhire.io/");
    expect(urls).toContain("https://tigerhire.io/jobs");
    expect(urls).toContain("https://tigerhire.io/pricing");

    // Blog posts from the hardcoded catalogue.
    expect(urls).toContain(
      "https://tigerhire.io/blog/why-ai-scoring-is-the-next-evolution-of-talent-acquisition",
    );

    // Job detail pages.
    expect(urls).toContain("https://tigerhire.io/jobs/job-1");
    expect(urls).toContain("https://tigerhire.io/jobs/job-2");

    const job1 = entries.find((e) => e.url.endsWith("/jobs/job-1"));
    expect(job1?.lastModified).toEqual(new Date("2026-08-02T00:00:00Z"));

    // Visibility filter mirrors GET /api/jobs/public.
    const eq = builder.eq as ReturnType<typeof vi.fn>;
    expect(eq).toHaveBeenCalledWith("status", "open");
    expect(eq).toHaveBeenCalledWith("list_on_public_job_board", true);
    expect(eq).toHaveBeenCalledWith("is_active", true);
    // Ownership mirrors isOwnedJob: source='tigerhire' or null.
    expect(builder.or).toHaveBeenCalledWith("source.eq.tigerhire,source.is.null");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns static + blog routes and logs a distinct warn event when the jobs query errors", async () => {
    mockAdmin.from.mockReturnValue(jobsBuilder([], { message: "relation does not exist" }));

    const sitemap = await loadSitemap();
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toContain("https://tigerhire.io/");
    expect(urls.some((u) => u.includes("/blog/"))).toBe(true);
    expect(urls.some((u) => /\/jobs\/.+/.test(u))).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      "sitemap_public_jobs_query_failed",
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it("never throws even when the admin client itself cannot be constructed", async () => {
    createSupabaseAdmin.mockImplementation(() => {
      throw new Error("Supabase env vars are required");
    });

    const sitemap = await loadSitemap();
    const entries = await sitemap();

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.map((e) => e.url)).toContain("https://tigerhire.io/");
    expect(warnSpy).toHaveBeenCalledWith(
      "sitemap_public_jobs_query_failed",
      expect.objectContaining({ error: expect.stringContaining("Supabase env vars") }),
    );
  });

  it("caps total entries at 5000", async () => {
    const rows = Array.from({ length: 6000 }, (_, i) => ({
      id: `job-${i}`,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: null,
      posted_at: null,
    }));
    const builder = jobsBuilder(rows);
    mockAdmin.from.mockReturnValue(builder);

    const sitemap = await loadSitemap();
    const entries = await sitemap();

    expect(entries.length).toBeLessThanOrEqual(5000);
    // And the query itself was budgeted below the cap.
    const limit = builder.limit as ReturnType<typeof vi.fn>;
    expect(limit.mock.calls[0]?.[0]).toBeLessThan(5000);
  });
});

describe("robots()", () => {
  it("disallows token/private paths for all crawlers and adds explicit AI-crawler groups", async () => {
    const { default: robots } = await import("@/app/robots");
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];

    const agents = rules.map((r) => r.userAgent);
    expect(agents).toContain("*");
    for (const bot of ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "CCBot"]) {
      expect(agents).toContain(bot);
    }

    for (const rule of rules) {
      const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
      expect(rule.allow).toBe("/");
      // Sensitive/token paths blocked in EVERY group, AI crawlers included.
      for (const path of [
        "/claim/",
        "/assessments/",
        "/schedule/",
        "/invite/",
        "/offers/",
        "/refer/auth",
        "/refer/login",
        "/refer/dashboard",
        "/candidate/",
        "/api/",
        "/admin/",
      ]) {
        expect(disallow).toContain(path);
      }
      // The public application form stays crawlable.
      expect(disallow).not.toContain("/apply/");
    }

    expect(result.sitemap).toBe("https://tigerhire.io/sitemap.xml");
  });
});
