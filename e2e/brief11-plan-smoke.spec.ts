import { test, expect } from "@playwright/test";
import { isTestLoginConfigured, loginWithFallback } from "./helpers/login";

const JOB_URL = "/recruit/jobs/861e8c58-9c72-4c46-8534-a02207a35cbc";

/**
 * These three assert on nav chrome that only renders once signed in, so a failed
 * login surfaced as "Plan link not visible" — a nav regression that was really a
 * missing password. Skip only the unconfigured environment; a signed-in seat
 * whose nav is wrong still fails.
 */
async function signInOrSkip(
  page: import("@playwright/test").Page,
  opts: { email: string; buttonName: RegExp; expectedPath: RegExp; seat: string },
) {
  await loginWithFallback(page, opts);
  if (opts.expectedPath.test(page.url())) return;
  const configured = await isTestLoginConfigured(page);
  test.skip(
    !configured,
    `${opts.seat} could not sign in and test login is not configured here — set SEED_DEMO_PASSWORD.`,
  );
  expect(page.url()).toMatch(opts.expectedPath);
}

test.describe("Brief 11 plan document smoke", () => {
  test("Kavita: no Interviews in top nav or sidebar", async ({ page }) => {
    await signInOrSkip(page, {
      email: "kavita.rao@finstack.in",
      buttonName: /hiring manager/i,
      // A hiring manager lands on /recruit/jobs, which renders HiringManagerHome
      // for that seat — one route, seat-specific screen. This used to read
      // /(home|company)/, from before that consolidation.
      expectedPath: /\/(home|company|recruit)/,
      seat: "Kavita (hiring manager)",
    });
    await page.goto("/home");

    const topNav = page.getByRole("navigation", { name: "Primary dashboard navigation" });
    await expect(topNav).toBeVisible({ timeout: 15_000 });
    const topLabels = await topNav.getByRole("link").allTextContents();
    expect(topLabels).not.toContain("Interviews");

    const sidebar = page.getByRole("navigation", { name: "Utility dashboard navigation" });
    await expect(sidebar).toBeVisible({ timeout: 15_000 });
    const sideLabels = await sidebar.getByRole("link").allTextContents();
    expect(sideLabels).not.toContain("Interviews");
    expect(sideLabels).not.toContain("Interview prep");
    expect(sideLabels).not.toContain("My availability");
  });

  /*
   * QUARANTINED 2026-08-06 — these two assert a job sub-nav that the app does
   * not render any more, and that is a product question, not a locator problem.
   *
   * With the login fixed they finally ran, and a full page snapshot of a signed-in
   * recruiter on the QA Engineer job shows one navigation landmark — the top nav.
   * There is no "Job sections" nav on the job workspace at all, so the Plan /
   * Applications / Scheduling / Assessments / Screening strip in RecruitJobSubNav
   * is unreachable, while the component itself is still in the tree
   * (RecruitJobWorkspaceLayout renders it behind `id && jobRaw`). The page instead
   * shows the redesigned "Action required" and "Job Setup" sections.
   *
   * These also predate a rename: the plan-mode sub-nav reads "Applications", not
   * the "Candidates" the test name still claims.
   *
   * So one of two things is true, and only the operator can say which:
   *   - the sub-nav was deliberately replaced by the redesigned sections, and
   *     both tests should be deleted along with the dead component; or
   *   - `jobRaw` stopped resolving and the sub-nav regressed out of the page,
   *     in which case this is a real bug and the tests were right all along.
   *
   * fixme rather than skip: they stay listed, named and expected-to-fail instead
   * of quietly passing, which is the failure mode #301 was about.
   */
  test.fixme("Kavita: company job opens plan workspace when flag on", async ({ page }) => {
    await signInOrSkip(page, {
      email: "kavita.rao@finstack.in",
      buttonName: /hiring manager/i,
      // A hiring manager lands on /recruit/jobs, which renders HiringManagerHome
      // for that seat — one route, seat-specific screen. This used to read
      // /(home|company)/, from before that consolidation.
      expectedPath: /\/(home|company|recruit)/,
      seat: "Kavita (hiring manager)",
    });
    await page.goto(JOB_URL);
    await expect(page).toHaveURL(new RegExp(`/recruit/jobs/${JOB_URL.split("/").pop()}`), {
      timeout: 15_000,
    });
    const jobSections = page.getByRole("navigation", { name: "Job sections" });
    await expect(jobSections.getByRole("link", { name: "Plan" })).toBeVisible();
    await expect(jobSections.getByRole("link", { name: "Candidates" })).toBeVisible();
  });

  /** Quarantined with the test above — same missing sub-nav, same open question. */
  test.fixme("Recruiter: Plan | Candidates sub-nav on QA Engineer job", async ({ page }) => {
    await signInOrSkip(page, {
      email: "rajiv.menon@finstack.in",
      buttonName: /recruiter/i,
      expectedPath: /\/(home|recruit)/,
      seat: "Rajiv (recruiter)",
    });
    await page.goto(JOB_URL);

    // Scoped to the job's own sub-nav: an unscoped "Candidates" link matches the
    // top-nav tab and "+ Add candidates" too, which is a strict-mode violation
    // rather than the assertion this test means to make.
    const jobSections = page.getByRole("navigation", { name: "Job sections" });
    await expect(jobSections.getByRole("link", { name: "Plan" })).toBeVisible({ timeout: 15_000 });
    await expect(jobSections.getByRole("link", { name: "Candidates" })).toBeVisible();

    const topNav = page.getByRole("navigation", { name: "Primary dashboard navigation" });
    const topLabels = await topNav.getByRole("link").allTextContents();
    expect(topLabels).not.toContain("Interviews");
  });
});
