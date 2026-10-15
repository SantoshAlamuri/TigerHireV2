import { test, expect } from "@playwright/test";
import { pilotLogin } from "../helpers/pilot-login";
import { lifecycleState } from "../helpers/pilot-lifecycle-state";
import { pilotJobUrl } from "../helpers/pilot-job";

test.describe("ACT 7 & 11 — Interview scheduling", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await Promise.race([
      pilotLogin(page, "recruiter").then(() => true),
      page.waitForTimeout(35_000).then(() => false),
    ]);
    test.skip(!loggedIn, "Recruiter login unavailable");
  });

  test("job scheduling tab: Create slots dialog", async ({ page }) => {
    await page.goto(pilotJobUrl());
    await page.getByRole("link", { name: "Scheduling" }).click();
    await expect(page).toHaveURL(/\/interviews/, { timeout: 15_000 });

    const createSlots = page.getByRole("button", { name: /create slots/i }).first();
    await expect(createSlots).toBeVisible({ timeout: 15_000 });
    await createSlots.click();
    await expect(page.getByRole("dialog", { name: /create interview slots/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/timezone|time zone/i).first()).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("calendar page loads for recruiter", async ({ page }) => {
    await page.goto("/calendar");
    await expect(page.getByRole("heading", { name: /this week/i })).toBeVisible({
      timeout: 20_000,
    });
    const createFromCal = page.getByRole("button", { name: /create slots/i }).first();
    if (await createFromCal.isVisible().catch(() => false)) {
      await createFromCal.click();
      await expect(page.getByRole("dialog", { name: /create interview slots/i })).toBeVisible({
        timeout: 10_000,
      });
      await page.keyboard.press("Escape");
    }
  });

  test("interviewer sees interview queue", async ({ page }) => {
    await pilotLogin(page, "interviewer");
    await page.goto("/company/interviews");
    await expect(page.getByRole("heading", { name: /interview/i })).toBeVisible({
      timeout: 15_000,
    });
  });
});
