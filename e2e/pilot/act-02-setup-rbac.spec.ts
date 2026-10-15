import { test, expect } from "@playwright/test";
import { pilotLogin } from "../helpers/pilot-login";
import { pilotBaseUrl } from "../helpers/pilot-env";

const BASE = pilotBaseUrl();

test.describe("ACT 2 — Setup access (org admin)", () => {
  test.beforeEach(async ({ page }) => {
    await pilotLogin(page, "leadership");
  });

  test("gear opens setup hub with area cards", async ({ page }) => {
    await page.goto("/home");
    await page.getByRole("link", { name: /organisation setup/i }).click();
    await expect(page).toHaveURL(/\/setup/, { timeout: 15_000 });
    await expect(page.getByRole("link", { name: /^Organisation\b/i }).first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^Hiring configuration\b/i }).first(),
    ).toBeVisible();
  });

  test("organisation profile and team pages load", async ({ page }) => {
    await page.goto(`${BASE}/setup/organization/profile`);
    await expect(page.getByLabel(/company email domain/i)).toBeVisible({ timeout: 20_000 });

    await page.goto(`${BASE}/company/team`);
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByText(/team|members/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test("hiring pipeline defaults under setup", async ({ page }) => {
    await page.goto(`${BASE}/setup/hiring-config/pipeline`);
    const forbidden = await page
      .getByText(/^Forbidden$/i)
      .isVisible()
      .catch(() => false);
    expect(forbidden).toBeFalsy();
    await expect(page.getByRole("heading", { name: /pipeline defaults/i })).toBeVisible({
      timeout: 20_000,
    });
  });
});

test.describe("ACT 2 — Setup blocked (recruiter)", () => {
  test.beforeEach(async ({ page }) => {
    await pilotLogin(page, "recruiter");
  });

  test("/setup returns forbidden or redirects away", async ({ page }) => {
    const res = await page.goto(`${BASE}/setup`);
    const forbidden = await page
      .getByText(/^Forbidden$/i)
      .isVisible()
      .catch(() => false);
    const onSetup = page.url().includes("/setup");
    expect(forbidden || !onSetup || (res?.status() ?? 0) === 403).toBeTruthy();
  });

  test("billing and team redirect to home", async ({ page }) => {
    for (const path of ["/company/billing", "/company/team", "/company/settings"]) {
      await page.goto(`${BASE}${path}`);
      await page.waitForTimeout(800);
      expect(page.url()).not.toMatch(/\/company\/(billing|team|settings)$/);
    }
  });

  test("pipeline and screening settings allowed for recruiter", async ({ page }) => {
    for (const path of ["/company/settings/pipeline", "/company/settings/screening"]) {
      await page.goto(`${BASE}${path}`);
      const forbidden = await page
        .getByText(/^Forbidden$/i)
        .isVisible()
        .catch(() => false);
      expect(forbidden).toBeFalsy();
    }
  });
});
