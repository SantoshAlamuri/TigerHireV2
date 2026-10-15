import { test, expect } from "@playwright/test";
import { isTestLoginConfigured, loginWithFallback } from "./helpers/login";

/**
 * Skip only when this environment has no way to sign in at all. A configured
 * environment that still lands on /login is a real regression and stays red.
 */
async function skipIfTestLoginUnavailable(page: import("@playwright/test").Page, seat: string) {
  const configured = await isTestLoginConfigured(page);
  test.skip(
    !configured,
    `${seat} could not sign in and test login is not configured here — set SEED_DEMO_PASSWORD.`,
  );
}

test.describe("Authentication flows", () => {
  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nonexistent@test.com");
    await page.locator('input[name="password"]').fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
  });

  test("protected routes redirect to login when unauthenticated", async ({ page }) => {
    await page.goto("/company");
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain("/login");
  });

  test("admin routes redirect to login when unauthenticated", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain("/login");
  });

  test("candidate routes redirect to login when unauthenticated", async ({ page }) => {
    await page.goto("/candidate");
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain("/login");
  });

  test("recruit routes redirect to login when unauthenticated", async ({ page }) => {
    await page.goto("/recruit");
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain("/login");
  });

  test("company admin login redirects to hiring portfolio", async ({ page }) => {
    await loginWithFallback(page, {
      email: "nidhi.gupta@finstack.in",
      buttonName: /company admin/i,
      expectedPath: /\/recruit\/v2\/portfolio/,
    });
    if (!page.url().includes("/recruit/v2/portfolio")) {
      await skipIfTestLoginUnavailable(page, "Company admin");
    }
    expect(page.url()).toContain("/recruit/v2/portfolio");
  });

  test("recruiter login redirects to recruit dashboard", async ({ page }) => {
    await loginWithFallback(page, {
      email: "rajiv.menon@finstack.in",
      buttonName: /recruiter/i,
      expectedPath: /\/recruit/,
    });
    if (!page.url().includes("/recruit")) await skipIfTestLoginUnavailable(page, "Recruiter");
    expect(page.url()).toContain("/recruit");
  });

  test("candidate login redirects to candidate dashboard", async ({ page }) => {
    await loginWithFallback(page, {
      email: "priya.sharma@gmail.com",
      buttonName: /candidate pro/i,
      expectedPath: /\/candidate/,
    });
    if (!page.url().includes("/candidate")) await skipIfTestLoginUnavailable(page, "Candidate");
    expect(page.url()).toContain("/candidate");
  });
});
