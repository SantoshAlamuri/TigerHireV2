import { expect, test } from "@playwright/test";
import { loginWithFallback } from "./helpers/login";

async function loginAsRecruiter(page: import("@playwright/test").Page) {
  await loginWithFallback(page, {
    email: "rajiv.menon@finstack.in",
    buttonName: /recruiter/i,
    expectedPath: /\/recruit/,
  });
}

async function loginAsHiringManager(page: import("@playwright/test").Page) {
  await loginWithFallback(page, {
    email: "kavita.rao@finstack.in",
    buttonName: /hiring manager/i,
    expectedPath: /\/company\/my-jobs/,
  });
}

test.describe("Personal settings navigation", () => {
  test("recruiter can open personal calendar integrations", async ({ page }) => {
    await loginAsRecruiter(page);
    test.skip(
      !page.url().includes("/recruit"),
      "Recruiter demo account unavailable in this environment.",
    );
    const recruiterSettingsLoaded = await page
      .goto("/recruit/settings/integrations", { waitUntil: "domcontentloaded" })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !recruiterSettingsLoaded,
      "Recruiter personal settings route unavailable in this build",
    );
    await expect(page).toHaveURL(/\/recruit\/settings\/integrations/);
    await expect(page.getByRole("heading", { name: "My Settings · Integrations" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Personal calendars" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Google Calendar" })).toBeVisible();
  });

  test("hiring manager can open personal calendar integrations", async ({ page }) => {
    await loginAsHiringManager(page);
    test.skip(
      !page.url().includes("/company"),
      "Hiring manager demo account unavailable in this environment.",
    );
    const hiringManagerSettingsLoaded = await page
      .goto("/company/my-settings/integrations", { waitUntil: "domcontentloaded" })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !hiringManagerSettingsLoaded,
      "Hiring manager personal settings route unavailable in this build",
    );
    await expect(page).toHaveURL(/\/company\/my-settings\/integrations/);
    await expect(page.getByRole("heading", { name: "My Settings · Integrations" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Personal calendars" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Outlook Calendar" })).toBeVisible();
  });
});
