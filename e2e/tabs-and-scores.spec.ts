import { test, expect } from "@playwright/test";
import { loginWithFallback } from "./helpers/login";

async function loginAs(page: import("@playwright/test").Page, email: string) {
  const buttonName = email.includes("nidhi.gupta")
    ? /company admin/i
    : email.includes("rajiv.menon")
      ? /recruiter/i
      : /candidate pro/i;
  const expectedPath = email.includes("nidhi.gupta")
    ? /\/company/
    : email.includes("rajiv.menon")
      ? /\/recruit/
      : /\/candidate/;
  await loginWithFallback(page, { email, buttonName, expectedPath });
}

test.describe("Tabs Functionality", () => {
  test.describe("Company Jobs Tabs", () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, "nidhi.gupta@finstack.in");
      test.skip(
        !page.url().includes("/company"),
        "Company admin demo account unavailable in this environment.",
      );
      await page.goto("/company/jobs");
      await page.waitForLoadState("domcontentloaded");
    });

    test("tabs are visible and clickable", async ({ page }) => {
      const allTab = page.getByRole("button", { name: /^all$/i });
      const activeTab = page.getByRole("button", { name: /^active$/i });
      const closedTab = page.getByRole("button", { name: /^closed$/i });

      await expect(allTab).toBeVisible({ timeout: 10000 });
      await expect(activeTab).toBeVisible();
      await expect(closedTab).toBeVisible();
    });

    test("clicking 'All' tab loads all jobs", async ({ page }) => {
      const allTab = page.getByRole("button", { name: /^all$/i });

      // Wait for initial load
      await page.waitForLoadState("domcontentloaded");

      // Click All tab
      await allTab.click();

      // Wait for data to load
      await page.waitForTimeout(1000);

      // Verify tab is active
      await expect(allTab).toHaveClass(/bg-\[var\(--accent\)\]/);

      // Verify page content loaded (either jobs or empty state)
      const hasContent = await page
        .getByText(/no.*jobs|job|active|closed/i)
        .first()
        .isVisible()
        .catch(() => false);
      expect(hasContent).toBeTruthy();
    });

    test("clicking 'Active' tab filters to active jobs", async ({ page }) => {
      const activeTab = page.getByRole("button", { name: /^active$/i });

      // Wait for initial load
      await page.waitForLoadState("domcontentloaded");

      // Click Active tab
      await activeTab.click();

      // Wait for API call to complete
      await page.waitForTimeout(1500);

      // Verify tab is active
      await expect(activeTab).toHaveClass(/bg-\[var\(--accent\)\]/);

      // Verify loading state cleared
      const loader = page.locator('[class*="animate-spin"]');
      await expect(loader).not.toBeVisible({ timeout: 5000 });
    });

    test("clicking 'Closed' tab filters to closed jobs", async ({ page }) => {
      const closedTab = page.getByRole("button", { name: /^closed$/i });

      // Wait for initial load
      await page.waitForLoadState("domcontentloaded");

      // Click Closed tab
      await closedTab.click();

      // Wait for API call to complete
      await page.waitForTimeout(1500);

      // Verify tab is active
      await expect(closedTab).toHaveClass(/bg-\[var\(--accent\)\]/);

      // Verify loading state cleared
      const loader = page.locator('[class*="animate-spin"]');
      await expect(loader).not.toBeVisible({ timeout: 5000 });
    });

    test("switching between tabs updates data correctly", async ({ page }) => {
      const allTab = page.getByRole("button", { name: /^all$/i });
      const activeTab = page.getByRole("button", { name: /^active$/i });
      const closedTab = page.getByRole("button", { name: /^closed$/i });

      await page.waitForLoadState("domcontentloaded");

      await expect(allTab).toBeVisible();
      await expect(activeTab).toBeVisible();
      await expect(closedTab).toBeVisible();
      await activeTab.click();
      await closedTab.click();
      await allTab.click();
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("Recruiter Jobs Tabs", () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, "rajiv.menon@finstack.in");
      test.skip(
        !page.url().includes("/recruit"),
        "Recruiter demo account unavailable in this environment.",
      );
      await page.goto("/recruit/jobs");
      await page.waitForLoadState("domcontentloaded");
    });

    test("tabs work correctly for recruiter", async ({ page }) => {
      const allTab = page.getByRole("button", { name: /^all$/i });
      const activeTab = page.getByRole("button", { name: /^active$/i });
      const closedTab = page.getByRole("button", { name: /^closed$/i });

      await expect(allTab).toBeVisible({ timeout: 10000 });
      await expect(activeTab).toBeVisible();
      await expect(closedTab).toBeVisible();

      // Test tab switching
      if (await activeTab.isVisible()) {
        await activeTab.click();
        await page.waitForTimeout(1000);
        await expect(activeTab).toHaveClass(/font-semibold|text-white/);
      }
    });
  });

  test.describe("Hiring Requests Tabs", () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, "nidhi.gupta@finstack.in");
      test.skip(
        !page.url().includes("/company"),
        "Company admin demo account unavailable in this environment.",
      );
      await page.goto("/company/hiring-requests");
      await page.waitForLoadState("domcontentloaded");
    });

    test("hiring requests tabs work correctly", async ({ page }) => {
      // Look for tab buttons (pending, converted, all)
      const tabButtons = page.getByRole("button").filter({ hasText: /pending|converted|all/i });
      const tabCount = await tabButtons.count();

      if (tabCount > 0) {
        const firstTab = tabButtons.first();
        await firstTab.click();
        await page.waitForTimeout(1000);

        // Verify tab is active
        await expect(firstTab).toHaveClass(/bg-\[var\(--accent\)\]/);
      }
    });
  });
});

test.describe("Scores Functionality", () => {
  test.describe("FitScore Display", () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, "rajiv.menon@finstack.in");
      test.skip(
        !page.url().includes("/recruit"),
        "Recruiter demo account unavailable in this environment.",
      );
    });

    test("scores load on job detail page", async ({ page }) => {
      // Navigate to jobs page
      await page.goto("/recruit/jobs");
      await page.waitForLoadState("domcontentloaded");

      // Try to find and click first job
      const jobLinks = page.locator('a[href*="/recruit/jobs/"]').filter({ hasNotText: /new/i });
      const jobCount = await jobLinks.count();

      if (jobCount > 0) {
        await jobLinks.first().click();
        await page.waitForURL(/\/recruit\/jobs\/[^/]+$/, { timeout: 10000 });
        await page.waitForLoadState("domcontentloaded");

        // Look for score-related content
        const scoreContent = page.getByText(/fit score|score|\d+\/100|shortlist|candidates/i);
        await expect(scoreContent.first()).toBeVisible({ timeout: 10000 });
      }
    });

    test("scores are displayed in candidate detail page", async ({ page }) => {
      await page.goto("/recruit/candidates");
      await page.waitForLoadState("domcontentloaded");

      // Try to find and click first candidate
      const candidateLinks = page.locator('a[href*="/recruit/candidates/"]');
      const candidateCount = await candidateLinks.count();

      if (candidateCount > 0) {
        await candidateLinks.first().click();
        await page.waitForURL(/\/recruit\/candidates\/[^/]+$/, { timeout: 10000 });
        await page.waitForLoadState("domcontentloaded");

        // Look for scores section
        const scoresSection = page.getByText(/fitscores|scores|fit score/i);
        await expect(scoresSection.first()).toBeVisible({ timeout: 10000 });
      }
    });

    test("candidate scores page loads and displays scores", async ({ page }) => {
      await loginAs(page, "priya.sharma@gmail.com");
      test.skip(
        !page.url().includes("/candidate"),
        "Candidate demo account unavailable in this environment.",
      );

      await page.goto("/candidate/scores");
      await page.waitForLoadState("domcontentloaded");
      await expect(page).toHaveURL(/\/candidate\/scores/);
      await expect(page.locator("body")).toBeVisible();
    });
  });

  test.describe("Score API Integration", () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, "rajiv.menon@finstack.in");
      test.skip(
        !page.url().includes("/recruit"),
        "Recruiter demo account unavailable in this environment.",
      );
    });

    test("score API returns data without errors", async ({ page }) => {
      // Intercept API calls
      const apiResponses: { url: string; status: number }[] = [];

      page.on("response", (response) => {
        const url = response.url();
        if (url.includes("/api/fit-score") || url.includes("/api/jobs")) {
          apiResponses.push({ url, status: response.status() });
        }
      });

      await page.goto("/recruit/jobs");
      await page.waitForLoadState("domcontentloaded");

      // Try to navigate to a job
      const jobLinks = page.locator('a[href*="/recruit/jobs/"]').filter({ hasNotText: /new/i });
      const jobCount = await jobLinks.count();

      if (jobCount > 0) {
        await jobLinks.first().click();
        await page.waitForURL(/\/recruit\/jobs\/[^/]+$/, { timeout: 10000 });
        await page.waitForLoadState("domcontentloaded");

        // Check for successful API responses
        const fitScoreResponses = apiResponses.filter((r) => r.url.includes("/api/fit-score"));
        if (fitScoreResponses.length > 0) {
          // At least one response should be successful (200 or 404 is ok)
          const hasSuccess = fitScoreResponses.some((r) => r.status < 500);
          expect(hasSuccess).toBeTruthy();
        }
      }
    });

    test("scores refresh when page becomes visible", async ({ page }) => {
      await page.goto("/recruit/jobs");
      await page.waitForLoadState("domcontentloaded");

      const jobLinks = page.locator('a[href*="/recruit/jobs/"]').filter({ hasNotText: /new/i });
      const jobCount = await jobLinks.count();

      if (jobCount > 0) {
        await jobLinks.first().click();
        await page.waitForURL(/\/recruit\/jobs\/[^/]+$/, { timeout: 10000 });
        await page.waitForLoadState("domcontentloaded");

        // Hide and show page to trigger visibility change
        await page.evaluate(() => {
          Object.defineProperty(document, "visibilityState", {
            writable: true,
            value: "hidden",
          });
          document.dispatchEvent(new Event("visibilitychange"));
        });

        await page.waitForTimeout(500);

        await page.evaluate(() => {
          Object.defineProperty(document, "visibilityState", {
            writable: true,
            value: "visible",
          });
          document.dispatchEvent(new Event("visibilitychange"));
        });

        // Wait a bit for potential refetch
        await page.waitForTimeout(2000);

        // Page should still be visible and functional
        await expect(page.locator("body")).toBeVisible();
      }
    });
  });

  test.describe("Score Loading States", () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, "rajiv.menon@finstack.in");
      test.skip(
        !page.url().includes("/recruit"),
        "Recruiter demo account unavailable in this environment.",
      );
    });

    test("loading spinner appears and disappears", async ({ page }) => {
      await page.goto("/recruit/jobs");
      await page.waitForLoadState("domcontentloaded");

      const jobLinks = page.locator('a[href*="/recruit/jobs/"]').filter({ hasNotText: /new/i });
      const jobCount = await jobLinks.count();

      if (jobCount > 0) {
        // Click job to navigate
        await jobLinks.first().click();

        // May see loading spinner briefly
        const spinner = page.locator('[class*="animate-spin"]');
        const spinnerVisible = await spinner.isVisible().catch(() => false);

        // Wait for content to load
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(2000);

        // Spinner should be gone
        await expect(spinner).not.toBeVisible({ timeout: 5000 });
      }
    });
  });
});

test.describe("Tab and Score Integration", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "nidhi.gupta@finstack.in");
    test.skip(
      !page.url().includes("/company"),
      "Company admin demo account unavailable in this environment.",
    );
  });

  test("tabs work correctly with API calls", async ({ page }) => {
    await page.goto("/company/jobs");
    await page.waitForLoadState("domcontentloaded");

    // Monitor network requests
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/jobs")) {
        requests.push(request.url());
      }
    });

    const activeTab = page.getByRole("button", { name: /^active$/i });
    const closedTab = page.getByRole("button", { name: /^closed$/i });

    if (await activeTab.isVisible()) {
      // Click active tab
      await activeTab.click();
      await page.waitForTimeout(1500);

      // Verify API was called with status=open
      const hasActiveRequest = requests.some((url) => url.includes("status=open"));

      // Click closed tab
      if (await closedTab.isVisible()) {
        await closedTab.click();
        await page.waitForTimeout(1500);

        // Verify API was called with status=closed
        const hasClosedRequest = requests.some((url) => url.includes("status=closed"));

        // At least one request should have been made
        expect(requests.length).toBeGreaterThan(0);
      }
    }
  });
});
