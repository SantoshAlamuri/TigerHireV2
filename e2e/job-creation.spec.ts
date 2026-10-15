import { test, expect } from "@playwright/test";
import { loginWithFallback } from "./helpers/login";

async function loginAsRecruiter(page: import("@playwright/test").Page) {
  try {
    await loginWithFallback(page, {
      email: "rajiv.menon@finstack.in",
      buttonName: /recruiter/i,
      expectedPath: /\/recruit/,
    });
  } catch {
    // Optional in local environments where demo accounts are not seeded.
  }
}

test.describe("Job creation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsRecruiter(page);
    test.skip(
      !page.url().includes("/recruit"),
      "Recruiter demo account unavailable in this environment.",
    );
  });

  test("recruiter can open new job form", async ({ page }) => {
    await page.goto("/recruit/jobs");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    const newJobLink = page.getByRole("link", { name: /new|create|post/i });
    if ((await newJobLink.count()) > 0) {
      await newJobLink.first().click();
      await page.waitForURL(/\/recruit\/jobs\/new|\/recruit\/hiring-requests\/new/);
    } else {
      await page.goto("/recruit/jobs/new");
    }
    const titleInput = page.getByLabel(/title|job title/i).first();
    if ((await titleInput.count()) > 0) {
      await expect(titleInput).toBeVisible({ timeout: 10000 });
      return;
    }
    await expect(
      page.getByText(/direct jd creation is disabled|create requisition|hiring request/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("new job form has title and submit", async ({ page }) => {
    await page.goto("/recruit/jobs/new");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    const titleInput = page.getByLabel(/title|job title/i).or(page.locator('input[name="title"]'));
    if ((await titleInput.count()) > 0) {
      await expect(titleInput.first()).toBeVisible({ timeout: 10000 });
      await titleInput.first().fill("E2E Test Role " + Date.now());
      const submitBtn = page.getByRole("button", {
        name: /submit|create|post|save/i,
      });
      await expect(submitBtn.first()).toBeVisible({ timeout: 5000 });
      return;
    }
    await expect(
      page.getByText(/direct jd creation is disabled|create requisition|hiring request/i).first(),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole("link", { name: /requisition|hiring request/i }).first(),
    ).toBeVisible({
      timeout: 5000,
    });
  });
});
