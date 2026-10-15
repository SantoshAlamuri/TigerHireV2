import { test, expect } from "@playwright/test";
import { PILOT_ACCOUNTS, type PilotAccountKey } from "../helpers/pilot-accounts";
import { pilotLogin, ensureDemoUsersSeeded } from "../helpers/pilot-login";
import { pilotBaseUrl } from "../helpers/pilot-env";

const LANDING_CASES: PilotAccountKey[] = [
  "superAdmin",
  "leadership",
  "recruiter",
  "hiringManager",
  "employee",
  "interviewer",
  "finance",
  "agency",
];

test.describe.configure({ mode: "serial" });

test.describe("ACT 1 — Login & role landing", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto(`${pilotBaseUrl()}/login`);
    await ensureDemoUsersSeeded(page);
    await page.close();
  });

  for (const key of LANDING_CASES) {
    const account = PILOT_ACCOUNTS[key];
    test(`${account.email} lands on expected dashboard`, async ({ page }) => {
      await pilotLogin(page, key);
      await expect(page).toHaveURL(account.expectedLanding, { timeout: 25_000 });
    });
  }

  test("leadership sees organisation setup gear", async ({ page }) => {
    await pilotLogin(page, "leadership");
    await page.goto("/home");
    await expect(page.getByRole("link", { name: /organisation setup/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("recruiter does not see organisation setup gear", async ({ page }) => {
    await pilotLogin(page, "recruiter");
    await page.goto("/home");
    const gear = page.getByRole("link", { name: /organisation setup/i });
    await expect(gear).toHaveCount(0);
  });

  test("employee home shows Refer & Earn", async ({ page }) => {
    await pilotLogin(page, "employee");
    await expect(page).toHaveURL(/\/employee/, { timeout: 15_000 });
    const referNav = page.getByRole("link", { name: /refer.*earn/i });
    await expect(referNav.or(page.getByText(/refer.*earn/i)).first()).toBeAttached({
      timeout: 15_000,
    });
  });
});

test.describe("ACT 1 — Sidebar visibility", () => {
  test("hiring manager: scoped jobs nav, not org-wide All Jobs", async ({ page }) => {
    await pilotLogin(page, "hiringManager");
    await page.goto("/home");
    const primary = page.getByRole("navigation", { name: "Primary dashboard navigation" });
    await expect(primary).toBeVisible({ timeout: 15_000 });
    const jobLink = primary.getByRole("link", { name: /overview|my jobs|jobs/i }).first();
    await expect(jobLink).toBeVisible();
    const href = (await jobLink.getAttribute("href")) ?? "";
    expect(href).toMatch(/\/company\/my-jobs/);
    expect(href).not.toMatch(/\/company\/jobs$/);
  });

  test("interviewer: interviews visible, pipeline hidden", async ({ page }) => {
    await pilotLogin(page, "interviewer");
    await page.goto("/home");
    const primary = page.getByRole("navigation", { name: "Primary dashboard navigation" });
    await expect(primary).toBeVisible({ timeout: 15_000 });
    const labels = (await primary.getByRole("link").allTextContents()).map((s) => s.trim());
    expect(labels.some((l) => /interview/i.test(l))).toBeTruthy();
    expect(labels.some((l) => /^pipeline$/i.test(l))).toBeFalsy();
  });
});
