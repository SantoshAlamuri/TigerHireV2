import { test, expect } from "@playwright/test";
import { pilotLogin } from "../helpers/pilot-login";
import { pilotBaseUrl } from "../helpers/pilot-env";

const BASE = pilotBaseUrl();

test.describe("ACT 12 — URL access edge cases", () => {
  test("hiring manager blocked from billing", async ({ page }) => {
    await pilotLogin(page, "hiringManager");
    await page.goto(`${BASE}/company/billing`);
    await page.waitForTimeout(1000);
    expect(page.url()).not.toContain("/company/billing");
  });

  test("employee cannot access recruit pipeline", async ({ page }) => {
    await pilotLogin(page, "employee");
    await page.goto(`${BASE}/recruit/pipeline`);
    await page.waitForTimeout(1000);
    expect(page.url()).not.toMatch(/\/recruit\/pipeline/);
  });

  test("agency cannot access company team", async ({ page }) => {
    await pilotLogin(page, "agency");
    await page.goto(`${BASE}/company/team`);
    await page.waitForTimeout(1000);
    expect(page.url()).not.toContain("/company/team");
  });
});
