import { test, expect } from "@playwright/test";
import { loginWithFallback } from "./helpers/login";

const RECRUITER_TABS = [
  "Jobs",
  "Candidates",
  "Pipeline",
  "This week",
  "Tasks",
  "Analytics",
  "Referrals",
];

const HM_TABS = ["Overview", "Pipeline", "This week", "Tasks", "Analytics"];

async function primaryNavLabels(page: import("@playwright/test").Page): Promise<string[]> {
  const nav = page.getByRole("navigation", { name: "Primary dashboard navigation" });
  await expect(nav).toBeVisible({ timeout: 15_000 });
  return nav.getByRole("link").allTextContents();
}

test.describe("Brief 4 nav smoke", () => {
  test("recruiter: primary nav + Referrals route", async ({ page }) => {
    await loginWithFallback(page, {
      email: "rajiv.menon@finstack.in",
      buttonName: /recruiter/i,
      expectedPath: /\/(home|recruit)/,
    });
    await page.goto("/home");
    const labels = await primaryNavLabels(page);
    expect(labels).toEqual(RECRUITER_TABS);
    expect(labels).not.toContain("Home");
    expect(labels).not.toContain("Offers");
    expect(labels).not.toContain("Assessments");

    await page
      .getByRole("navigation", { name: "Primary dashboard navigation" })
      .getByRole("link", { name: "Referrals" })
      .click();
    await page.waitForURL(/\/company\/referrals/);
    expect(page.url()).toContain("/company/referrals");
  });

  test("hiring manager: Analytics tab visible and loads", async ({ page }) => {
    await loginWithFallback(page, {
      email: "kavita.rao@finstack.in",
      buttonName: /hiring manager/i,
      expectedPath: /\/(home|company)/,
    });
    await page.goto("/home");
    const labels = await primaryNavLabels(page);
    expect(labels).toEqual(HM_TABS);
    expect(labels).toContain("Analytics");

    await page
      .getByRole("navigation", { name: "Primary dashboard navigation" })
      .getByRole("link", { name: "Analytics" })
      .click();
    await page.waitForURL(/\/recruit\/analytics/);
    await expect(page.getByRole("heading", { name: /analytics/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/funnel|applied|headline/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
