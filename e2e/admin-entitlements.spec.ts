import { expect, test } from "@playwright/test";
import { loginWithFallback } from "./helpers/login";
import { gotoRoute } from "./helpers/navigation";

async function loginAsAdmin(page: import("@playwright/test").Page) {
  try {
    await loginWithFallback(page, {
      email: "sam@tigerhire.io",
      buttonName: /super admin/i,
      expectedPath: /\/admin/,
    });
  } catch {
    // Some environments do not seed super admin credentials for one-click/demo login.
  }
}

test.describe("Admin Entitlements", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    test.skip(
      !page.url().includes("/admin"),
      "Super admin account unavailable in this environment.",
    );
  });

  test("plan limits page exposes feature entitlements controls", async ({ page }) => {
    await gotoRoute(page, "/admin/plan-limits");
    await expect(page.getByRole("heading", { name: /plan limits/i })).toBeVisible({
      timeout: 10000,
    });

    const rows = page.locator("tbody tr");
    if ((await rows.count()) === 0) {
      await expect(
        page.getByText(/no company plans|no plans|billing plans/i).first(),
      ).toBeVisible();
      return;
    }

    const firstRow = rows.first();
    await expect(firstRow).toBeVisible();
    await firstRow.getByRole("button", { name: /edit/i }).click();

    await expect(firstRow.getByLabel(/agent runs/i)).toBeVisible();
    await expect(firstRow.getByLabel(/fitscore batch/i)).toBeVisible();
    await expect(firstRow.getByLabel(/assessments/i)).toBeVisible();
    await expect(firstRow.getByLabel(/offers/i)).toBeVisible();
    await expect(firstRow.getByLabel(/interview prep/i)).toBeVisible();
    await expect(firstRow.getByLabel(/scim/i)).toBeVisible();

    await firstRow.getByRole("button", { name: /cancel/i }).click();
  });

  test("organisations page allows opening per-org feature controls", async ({ page }) => {
    await gotoRoute(page, "/admin/organisations");
    await expect(page.getByRole("heading", { name: /organisations/i })).toBeVisible({
      timeout: 10000,
    });

    const firstFeatureButton = page.getByRole("button", { name: /features/i }).first();
    await firstFeatureButton.click();

    await expect(page.getByRole("heading", { name: /feature controls/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole("columnheader", { name: /feature/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /plan default/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /override/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /effective/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /close/i })).toBeVisible();
    await page.getByRole("button", { name: /close/i }).click();
  });

  test("feature flags page communicates global kill-switch behavior", async ({ page }) => {
    await gotoRoute(page, "/admin/feature-flags");
    await expect(page.getByRole("heading", { name: /feature flags/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/global (emergency|kill) switches/i).first()).toBeVisible();
  });
});
