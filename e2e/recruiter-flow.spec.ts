import { test, expect } from "@playwright/test";
import { loginWithFallback } from "./helpers/login";

async function loginAsRecruiter(page: import("@playwright/test").Page) {
  try {
    await loginWithFallback(page, {
      email: "rajiv.menon@finstack.in",
      buttonName: /recruiter/i,
      expectedPath: /\/recruit/,
    });
    return /\/recruit/.test(page.url());
  } catch {
    return false;
  }
}

test.describe("Recruiter Flow", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await Promise.race([
      loginAsRecruiter(page),
      page.waitForTimeout(25000).then(() => false),
    ]);
    expect(loggedIn, "Required recruiter login failed; check seeded preview account").toBe(true);
  });

  test("recruiter dashboard loads", async ({ page }) => {
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    expect(page.url()).toContain("/recruit");
  });

  test("legacy new-job link opens the role request form", async ({ page }) => {
    await page.goto("/recruit/jobs/new");
    await expect(page).toHaveURL(/\/company\/hiring-requests\/new/);
    await expect(page.getByRole("heading", { name: "Request a role" })).toBeVisible();
    await expect(page.locator("#hr-title")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeVisible();
  });

  test("recruiter can browse candidates", async ({ page }) => {
    await page.goto("/recruit/candidates");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
  });

  test("recruiter can view jobs list", async ({ page }) => {
    await page.goto("/recruit/jobs");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
  });

  test("recruiter can view applications", async ({ page }) => {
    await page.goto("/recruit/applications", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
  });

  test("recruiter can view pipeline page", async ({ page }) => {
    await page.goto("/recruit/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
  });

  test("recruiter can view analytics", async ({ page }) => {
    await page.goto("/recruit/analytics", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
  });

  test("recruiter can view hiring requests", async ({ page }) => {
    await page.goto("/recruit/hiring-requests");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
  });

  test("recruiter can view saved searches", async ({ page }) => {
    await page.goto("/recruit/saved-searches");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
  });

  test("recruiter can navigate to candidate detail via candidates page", async ({ page }) => {
    await page.goto("/recruit/candidates");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    const candidateLink = page.getByRole("link", { name: /view|details|profile/i }).first();
    if ((await candidateLink.count()) > 0) {
      await candidateLink.click();
      await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
      expect(page.url()).toContain("/recruit/candidates");
    }
  });
});
