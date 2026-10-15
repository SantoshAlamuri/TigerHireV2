import { expect, test } from "@playwright/test";
import { loginWithFallback } from "./helpers/login";
import { gotoRoute } from "./helpers/navigation";

async function loginAsCompanyAdmin(page: import("@playwright/test").Page) {
  await loginWithFallback(page, {
    email: "company@tigerhire.io",
    buttonName: /company admin/i,
    expectedPath: /\/company/,
  });
}

test.describe("Company Settings", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCompanyAdmin(page);
    test.skip(
      !page.url().includes("/company"),
      "Company admin demo account unavailable in this environment.",
    );
  });

  test("admin can navigate integrations page", async ({ page }) => {
    await gotoRoute(page, "/company/settings/integrations");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/company\/settings\/integrations/);
  });

  test("admin can navigate privacy page", async ({ page }) => {
    await gotoRoute(page, "/company/settings/privacy");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/company\/settings\/privacy/);
  });

  test("admin can navigate job boards page", async ({ page }) => {
    await gotoRoute(page, "/company/settings/job-boards");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/company\/settings\/job-boards/);
    await expect(page.getByRole("heading", { name: "Adzuna" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Indeed" })).toBeVisible();
  });

  test("admin can navigate audit page", async ({ page }) => {
    await gotoRoute(page, "/company/settings/audit");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/company\/settings\/audit/);
  });

  test("non-admin is blocked from company settings", async ({ page }) => {
    const context = await page.context().browser()!.newContext();
    const freshPage = await context.newPage();
    await loginWithFallback(freshPage, {
      email: "candidate@tigerhire.io",
      buttonName: /candidate/i,
      expectedPath: /\/candidate/,
    });
    await gotoRoute(freshPage, "/company/settings/integrations");
    await expect(freshPage).toHaveURL(/\/candidate|\/login/);
    await context.close();
  });
});
