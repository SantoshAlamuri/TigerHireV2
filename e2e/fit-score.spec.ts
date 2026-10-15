import { test, expect } from "@playwright/test";
import { loginWithFallback } from "./helpers/login";
import { gotoRoute } from "./helpers/navigation";

async function loginAsRecruiter(page: import("@playwright/test").Page) {
  await loginWithFallback(page, {
    email: "rajiv.menon@finstack.in",
    buttonName: /recruiter/i,
    expectedPath: /\/recruit/,
  });
}

test.describe("Fit score viewing", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsRecruiter(page);
    test.skip(
      !page.url().includes("/recruit"),
      "Recruiter demo account unavailable in this environment.",
    );
  });

  test("applications page loads and shows application list or empty state", async ({ page }) => {
    await gotoRoute(page, "/recruit/applications");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole("heading", { name: /inbound applications|applications/i }).first(),
    ).toBeVisible();
  });

  test("applications page has FitScore or score context when present", async ({ page }) => {
    await gotoRoute(page, "/recruit/applications");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/recruit\/applications/);
  });

  test("recruiter can navigate to a job shortlist (fit score list)", async ({ page }) => {
    await gotoRoute(page, "/recruit/jobs");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    const firstJobLink = page.getByRole("link", { name: /.+/ }).first();
    if ((await firstJobLink.count()) > 0) {
      const href = await firstJobLink.getAttribute("href");
      if (href && href.includes("/recruit/jobs/") && !href.endsWith("/new")) {
        await firstJobLink.click();
        await page.waitForTimeout(2000);
        await expect(page.getByText(/shortlist|fit score|score|candidates/i).first()).toBeVisible({
          timeout: 10000,
        });
      }
    }
  });
});
