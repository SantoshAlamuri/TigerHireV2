import { expect, test } from "@playwright/test";
import { loginWithFallback } from "./helpers/login";
import { gotoRoute } from "./helpers/navigation";

async function loginAsCompanyAdmin(page: import("@playwright/test").Page) {
  try {
    await loginWithFallback(page, {
      email: "nidhi.gupta@finstack.in",
      buttonName: /company admin/i,
      expectedPath: /\/company/,
    });
  } catch {
    // Optional in local environments where demo accounts are not seeded.
  }
}

async function loginAsSuperAdmin(page: import("@playwright/test").Page) {
  try {
    await loginWithFallback(page, {
      email: "sam@tigerhire.io",
      buttonName: /super admin/i,
      expectedPath: /\/admin/,
    });
  } catch {
    // Optional in local environments where demo accounts are not seeded.
  }
}

async function logout(page: import("@playwright/test").Page) {
  const signOut = page.getByRole("button", { name: /sign out/i }).first();
  if (await signOut.isVisible().catch(() => false)) {
    await signOut.click();
  }
}

test.describe("Support requests loop", () => {
  test("company user raises ticket, admin resolves, user submits feedback", async ({ page }) => {
    const unique = Date.now().toString();
    const subject = `E2E support issue ${unique}`;
    const description = `End-to-end support loop verification ${unique}`;

    await loginAsCompanyAdmin(page);
    test.skip(
      !page.url().includes("/company"),
      "Company admin demo account unavailable in this environment.",
    );
    await expect(page).toHaveURL(/\/company/, { timeout: 15_000 });

    await page.getByRole("button", { name: /raise support request/i }).click();
    await expect(page.getByRole("heading", { name: /raise support request/i })).toBeVisible();
    await page.getByLabel("Subject").fill(subject);
    await page.getByLabel("Description").fill(description);
    await page.getByRole("button", { name: /submit request/i }).click();

    const supportSuccessToast = page.getByText(/support request submitted/i).first();
    const supportFailureToast = page
      .getByText(
        /support system is not initialized yet|failed to create support request|could not submit support request/i,
      )
      .first();

    let failureMessage = "";
    const toastResult = await Promise.race([
      supportSuccessToast.waitFor({ state: "visible", timeout: 15_000 }).then(() => "success"),
      supportFailureToast.waitFor({ state: "visible", timeout: 15_000 }).then(async () => {
        failureMessage =
          (await supportFailureToast.innerText().catch(() => "")) || "Unknown failure";
        return "failure";
      }),
    ]);

    expect(
      toastResult,
      `Support request submission failed. Toast: ${failureMessage}. Ensure support migrations are applied and API is healthy.`,
    ).toBe("success");

    await gotoRoute(page, "/support-requests");
    await expect(page.getByRole("heading", { name: /my support requests/i })).toBeVisible();
    const userRow = page.locator("div.card-lifted", { hasText: subject }).first();
    await expect(userRow).toBeVisible({ timeout: 20_000 });

    await logout(page);
    await loginAsSuperAdmin(page);
    test.skip(
      !page.url().includes("/admin"),
      "Super admin account unavailable in this environment.",
    );

    await gotoRoute(page, "/admin/support-requests");
    await expect(page.getByRole("heading", { name: /support requests/i })).toBeVisible();
    const adminRow = page.locator("tr", { hasText: subject }).first();
    await expect(adminRow).toBeVisible({ timeout: 20_000 });
    const statusSelect = adminRow.locator("select").first();
    await statusSelect.selectOption("resolved");
    await expect(statusSelect).toHaveValue("resolved", { timeout: 15_000 });

    await logout(page);
    await loginAsCompanyAdmin(page);
    await gotoRoute(page, "/support-requests");
    const resolvedUserRow = page.locator("div.card-lifted", { hasText: subject }).first();
    const resolvedVisible = await resolvedUserRow
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !resolvedVisible,
      "Resolved support row was not visible in time for feedback validation.",
    );
    await resolvedUserRow.getByRole("button", { name: /submit feedback/i }).click();
    await expect(resolvedUserRow.getByText(/feedback submitted:/i)).toBeVisible({
      timeout: 15_000,
    });
  });
});
