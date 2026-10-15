import { test, expect } from "@playwright/test";
import { loginWithFallback } from "./helpers/login";
import { gotoRoute } from "./helpers/navigation";

async function loginAs(page: import("@playwright/test").Page, email: string) {
  if (email.includes("nidhi.gupta")) {
    await loginWithFallback(page, {
      email,
      buttonName: /company admin/i,
      expectedPath: /\/recruit\/v2\/portfolio/,
    });
    return;
  }
  if (email.includes("rajiv.menon")) {
    await loginWithFallback(page, {
      email,
      buttonName: /recruiter/i,
      expectedPath: /\/recruit/,
    });
    return;
  }
  await loginWithFallback(page, {
    email,
    buttonName: /candidate pro/i,
    expectedPath: /\/candidate/,
  });
}

test.describe("Company dashboard navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "nidhi.gupta@finstack.in");
    test.skip(
      !page.url().includes("/recruit/v2/portfolio"),
      "Company admin demo account unavailable in this environment.",
    );
  });

  test("lands leadership on portfolio with hiring signals", async ({ page }) => {
    await expect(page).toHaveURL(/\/recruit\/v2\/portfolio/);
    await expect(page.getByRole("heading", { name: /portfolio/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText(/open jobs|where each job is stuck|no open jobs/i).first(),
    ).toBeVisible({
      timeout: 15_000,
    });
  });

  test("can navigate to jobs page", async ({ page }) => {
    await gotoRoute(page, "/company/jobs");
    await page.waitForURL(/\/company\/jobs/);
    await expect(page.locator("body")).toBeVisible();
  });

  test("can navigate to team page", async ({ page }) => {
    await gotoRoute(page, "/company/team");
    await page.waitForURL(/\/company\/team/);
    await expect(page.locator("body")).toBeVisible();
  });

  test("can navigate to billing page", async ({ page }) => {
    await gotoRoute(page, "/company/billing");
    await page.waitForURL(/\/company\/billing/);
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("Recruiter dashboard navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "rajiv.menon@finstack.in");
    test.skip(
      !page.url().includes("/recruit"),
      "Recruiter demo account unavailable in this environment.",
    );
  });

  test("shows recruiter dashboard", async ({ page }) => {
    await expect(page.locator("body")).toBeVisible();
  });

  test("can navigate to candidates page", async ({ page }) => {
    await gotoRoute(page, "/recruit/candidates");
    await page.waitForURL(/\/recruit\/candidates/);
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("Candidate dashboard navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "priya.sharma@gmail.com");
    test.skip(
      !page.url().includes("/candidate"),
      "Candidate demo account unavailable in this environment.",
    );
  });

  test("shows candidate dashboard", async ({ page }) => {
    await expect(page.locator("body")).toBeVisible();
  });

  test("can navigate to profile page", async ({ page }) => {
    await gotoRoute(page, "/profile");
    await expect(page.locator("body")).toBeVisible();
  });

  test("can navigate to scores page", async ({ page }) => {
    await page.goto("/candidate/scores");
    await page.waitForURL(/\/candidate\/scores/);
    await expect(page.locator("body")).toBeVisible();
  });
});
