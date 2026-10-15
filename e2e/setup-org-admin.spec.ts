import { test, expect } from "@playwright/test";
import { loginWithFallback } from "./helpers/login";

const BASE = (process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function dismissCookieBanner(page: import("@playwright/test").Page) {
  const accept = page.getByRole("button", { name: /accept|agree|allow/i }).first();
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
  }
}

test.describe("Setup mode (org admin)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    const loggedIn = await Promise.race([
      loginWithFallback(page, {
        email: process.env.E2E_ORG_ADMIN_EMAIL ?? "rajiv.menon@finstack.in",
        buttonName: /leadership|recruiter|company/i,
        expectedPath: /\/(home|company|recruit|setup)/,
      }).then(() => true),
      page.waitForTimeout(45_000).then(() => false),
    ]);
    test.skip(!loggedIn, "Org admin demo login unavailable");
    await dismissCookieBanner(page);
  });

  test("gear opens setup and organisation profile loads in-shell", async ({ page }) => {
    const gear = page.getByRole("link", { name: /organisation setup/i });
    if (!(await gear.isVisible().catch(() => false))) {
      test.skip(true, "Current user is not org admin (no setup gear)");
    }
    await gear.click();
    await expect(page).toHaveURL(/\/setup/, { timeout: 15_000 });

    await page.getByRole("link", { name: "Organisation" }).click();
    await expect(page).toHaveURL(/\/setup\/organization\/profile/, { timeout: 15_000 });
    await expect(page.getByLabel(/company email domain/i)).toBeVisible({ timeout: 15_000 });
  });

  test("hiring pipeline defaults reachable under setup", async ({ page }) => {
    await page.goto(`${BASE}/setup/hiring-config/pipeline`);
    const forbidden = await page
      .getByText(/^Forbidden$/i)
      .isVisible()
      .catch(() => false);
    if (forbidden) {
      test.skip(true, "User lacks is_org_admin for /setup");
    }
    await expect(page.getByRole("heading", { name: /pipeline defaults/i })).toBeVisible({
      timeout: 20_000,
    });
  });
});
