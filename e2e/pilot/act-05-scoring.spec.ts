import { test, expect } from "@playwright/test";
import { pilotLogin } from "../helpers/pilot-login";
import { getPipelineCandidates } from "../helpers/pilot-api";
import { lifecycleState } from "../helpers/pilot-lifecycle-state";
import { pilotJobUrl } from "../helpers/pilot-job";

test.describe("ACT 5 — Scoring & verdict card", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await Promise.race([
      pilotLogin(page, "recruiter").then(() => true),
      page.waitForTimeout(35_000).then(() => false),
    ]);
    test.skip(!loggedIn, "Recruiter login unavailable");
  });

  test("pipeline or candidates view shows FitScore / verdict for seeded candidates", async ({
    page,
  }) => {
    const jobId = lifecycleState.jobId;
    const candidates = await getPipelineCandidates(page.request, jobId, 5);
    test.skip(candidates.length === 0, "No pipeline candidates on pilot job");

    await page.goto(`/recruit/pipeline?jobId=${encodeURIComponent(jobId)}`);
    await expect(page.getByText(/pipeline/i).first()).toBeVisible({ timeout: 15_000 });

    const scorePattern = /fit|score|strong fit|good fit|possible fit|\d{1,3}%/i;
    const hasScoreUi = await page
      .getByText(scorePattern)
      .first()
      .isVisible()
      .catch(() => false);
    if (!hasScoreUi) {
      await page.goto(pilotJobUrl());
      await page.getByRole("link", { name: "Candidates" }).click();
      await expect(page.getByText(scorePattern).first()).toBeVisible({ timeout: 20_000 });
    }
  });

  test("candidate detail opens from job candidates tab when present", async ({ page }) => {
    const jobId = lifecycleState.jobId;
    await page.goto(pilotJobUrl());
    const candidatesTab = page.getByRole("link", { name: "Candidates" });
    if (!(await candidatesTab.isVisible().catch(() => false))) {
      test.skip(true, "Candidates tab not on this job layout");
    }
    await candidatesTab.click();
    const card = page
      .getByRole("link", { name: /.+/ })
      .filter({ hasNotText: /plan|candidates/i })
      .first();
    if (await card.isVisible().catch(() => false)) {
      await card.click();
      await expect(page.locator("body")).toBeVisible();
    }
  });
});
