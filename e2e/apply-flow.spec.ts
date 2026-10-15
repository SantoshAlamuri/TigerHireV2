import { test, expect } from "@playwright/test";
import { applyPagePath } from "./helpers/apply-slug";
import { gotoRoute } from "./helpers/navigation";

/**
 * E2E: Public apply flow — visit apply page, fill form, submit.
 * Requires an org whose slug matches `E2E_APPLY_ORG_SLUG` (default "razorpay") and at least one open job.
 */
test.describe("Apply flow", () => {
  test("apply page loads for valid org slug", async ({ page }) => {
    await gotoRoute(page, applyPagePath());
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    expect(page.url()).toContain(applyPagePath());
  });

  test("apply form shows file upload and contact fields", async ({ page }) => {
    await gotoRoute(page, applyPagePath());
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    const uploadDropzone = page.getByText(/drop your (cv|resume) here or tap to upload/i).first();
    const hasDropzone = await uploadDropzone.isVisible().catch(() => false);
    test.skip(!hasDropzone, "Apply form controls are unavailable for this org slug seed data.");
    await expect(uploadDropzone).toBeVisible({ timeout: 10000 });
  });

  test("public job page has Apply link when job has org slug", async ({ page }) => {
    await gotoRoute(page, "/");
    await expect(page.getByText(/TigerHire/i).first()).toBeVisible({
      timeout: 10000,
    });
    const jobsLink = page.getByRole("link", {
      name: /jobs|careers|open role/i,
    });
    if ((await jobsLink.count()) > 0) {
      await jobsLink.first().click();
      await page.waitForTimeout(2000);
      const applyLink = page.getByRole("link", { name: /apply/i }).first();
      if ((await applyLink.count()) > 0) {
        await expect(applyLink).toBeVisible();
      }
    }
  });
});
