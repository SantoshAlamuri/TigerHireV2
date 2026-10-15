import { test, expect } from "@playwright/test";

test.describe("Public pages", () => {
  test("homepage loads and shows TigerHire branding", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/TigerHire/i);
    await expect(page.locator("body")).toBeVisible();
  });

  test("about page loads", async ({ page }) => {
    await page.goto("/about");
    await expect(page.locator("main, body").first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /lived the problem|Built by someone/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("pricing page loads", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.locator("body")).toBeVisible();
  });

  test("contact page loads", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.locator("body")).toBeVisible();
  });

  test("waitlist page loads", async ({ page }) => {
    await page.goto("/waitlist");
    await expect(page.locator("body")).toBeVisible();
  });

  test("DPA page loads", async ({ page }) => {
    await page.goto("/dpa");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByRole("heading", { name: /data processing \(B2B\)/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test("login page loads with form fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("register page loads", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator("body")).toBeVisible();
  });

  test("login page has link to register", async ({ page }) => {
    await page.goto("/login");
    const registerLink = page.getByRole("link", { name: /create one/i });
    await expect(registerLink).toBeVisible();
    await expect(registerLink).toHaveAttribute("href", "/register");
  });
});
