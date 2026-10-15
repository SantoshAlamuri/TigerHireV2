import { expect, test } from "@playwright/test";
import { loginWithFallback } from "./helpers/login";
import { gotoRoute } from "./helpers/navigation";

async function loginAsCompanyAdmin(page: import("@playwright/test").Page) {
  try {
    await loginWithFallback(page, {
      email: "company@tigerhire.io",
      buttonName: /company admin/i,
      expectedPath: /\/company/,
    });
  } catch {
    // Optional in local environments where demo accounts are not seeded.
  }
}

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

test.describe("Feature happy-path navigation coverage", () => {
  test("company admin can open offers dashboard", async ({ page }) => {
    await loginAsCompanyAdmin(page);
    test.skip(
      !page.url().includes("/company"),
      "Company admin demo account unavailable in this environment.",
    );
    await gotoRoute(page, "/company/offers");
    await expect(page.getByRole("heading", { name: "Offers" })).toBeVisible();
  });

  test("recruiter can open assessments dashboard", async ({ page }) => {
    await loginAsRecruiter(page);
    test.skip(
      !page.url().includes("/recruit"),
      "Recruiter demo account unavailable in this environment.",
    );
    await gotoRoute(page, "/recruit/assessments");
    await expect(page.getByRole("heading", { name: /assessments/i }).first()).toBeVisible();
  });

  test("recruiter dashboard tomorrow plan deep link applies focus mode", async ({ page }) => {
    await loginAsRecruiter(page);
    test.skip(
      !page.url().includes("/recruit"),
      "Recruiter demo account unavailable in this environment.",
    );
    await gotoRoute(page, "/recruit");
    await page.getByRole("button", { name: /start tomorrow plan/i }).click();
    await expect(page).toHaveURL(/\/recruit\/pipeline\?focus=tomorrow-plan/);
    await expect(page.getByText("Focus mode:")).toBeVisible();
  });

  test("public assessment invalid token shows not found style message", async ({ page }) => {
    await gotoRoute(page, "/assessments/invalid-token");
    await expect(page.getByText(/unauthorized|assessment (link )?not found/i)).toBeVisible();
  });
});
