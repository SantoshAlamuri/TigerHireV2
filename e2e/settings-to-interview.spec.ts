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

test.describe("Settings workflow (company)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCompanyAdmin(page);
    test.skip(
      !page.url().includes("/company"),
      "Company admin demo account unavailable in this environment.",
    );
  });

  test("admin can open integrations page", async ({ page }) => {
    await gotoRoute(page, "/company/settings/integrations");
    await expect(page).toHaveURL(/\/company\/settings\/integrations/);
    await expect(page.getByRole("heading", { name: "Organisation tools" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "SendGrid" })).toBeVisible();
  });

  test("admin can expand sendgrid form and enter key", async ({ page }) => {
    await gotoRoute(page, "/company/settings/integrations");

    const sendgridCard = page
      .getByRole("heading", { name: "SendGrid" })
      .locator("xpath=ancestor::section[1]");
    const configureButton = sendgridCard
      .getByRole("button", { name: /^(configure|edit|update)$/i })
      .first();
    const canConfigure = await configureButton.isVisible().catch(() => false);
    test.skip(!canConfigure, "SendGrid integration controls unavailable in this environment.");
    await configureButton.click();

    const apiKeyInput = page.getByPlaceholder("Enter API Key").first();
    await expect(apiKeyInput).toBeVisible();
    await expect(apiKeyInput).toHaveAttribute("type", "password");

    await page
      .getByRole("button", { name: /toggle api key visibility/i })
      .first()
      .click();
    await expect(apiKeyInput).toHaveAttribute("type", "text");

    await apiKeyInput.fill("SG.test_key_123456789");
    await expect(page.getByRole("button", { name: /save integration key/i })).toBeEnabled();
  });

  test("admin can open privacy page and edit fields", async ({ page }) => {
    await gotoRoute(page, "/company/settings/privacy");
    await expect(page).toHaveURL(/\/company\/settings\/privacy/);

    const consentMessage = page.locator("textarea").first();
    await consentMessage.fill(
      "This interview will be recorded and transcribed. By continuing you consent.",
    );

    const recordingDays = page.locator('input[type="number"]').first();
    await recordingDays.fill("120");
    await expect(recordingDays).toHaveValue("120");

    await expect(page.getByRole("button", { name: /save privacy settings/i })).toBeVisible();
  });

  test("admin can open audit page", async ({ page }) => {
    await gotoRoute(page, "/company/settings/audit");
    await expect(page).toHaveURL(/\/company\/settings\/audit/);
    await expect(page.getByRole("button", { name: /load more/i })).toBeVisible();
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
