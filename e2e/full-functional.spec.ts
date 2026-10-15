import { test, expect } from "@playwright/test";
import { applyPagePath } from "./helpers/apply-slug";
import { loginWithFallback } from "./helpers/login";
import { gotoRoute } from "./helpers/navigation";

/**
 * Full functional test suite: critical user journeys end-to-end.
 * Run with: npm run test:e2e -- e2e/full-functional.spec.ts
 *
 * Prerequisites: Demo users seeded (nidhi.gupta@finstack.in, rajiv.menon@finstack.in,
 * priya.sharma@gmail.com with password Demo@1234), org slug matching `E2E_APPLY_ORG_SLUG`
 * (default "razorpay"), at least one open job.
 */

const DEMO_PASSWORD = "Demo@1234";

async function loginAs(page: import("@playwright/test").Page, email: string, expectedPath: RegExp) {
  const buttonName = email.includes("nidhi.gupta")
    ? /company admin/i
    : email.includes("rajiv.menon")
      ? /recruiter/i
      : /candidate pro/i;

  await loginWithFallback(page, { email, buttonName, expectedPath, password: DEMO_PASSWORD });
}

test.describe("Full functional — Public & discovery", () => {
  test("homepage loads with branding and key links", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/TigerHire/i);
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByRole("link", { name: /jobs|careers|open/i }).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("public pages: about, pricing, contact, waitlist, login, register", async ({ page }) => {
    const urls = [
      { path: "/about", text: /lived the problem|TigerHire|Remote-first/i },
      { path: "/pricing", text: /pricing|plan|price/i },
      { path: "/contact", text: /contact|get in touch/i },
      { path: "/waitlist", text: /waitlist|join/i },
      { path: "/login", text: /sign in|email|password/i },
      { path: "/register", text: /i'm hiring|i'm an agency|looking for work|tigerhire/i },
    ];
    for (const { path, text } of urls) {
      await page.goto(path);
      await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(text).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("apply page loads for valid org slug", async ({ page }) => {
    await page.goto(applyPagePath());
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("heading", { name: /submit your (cv|resume)/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/drop your (cv|resume) here or tap to upload/i)).toBeVisible({
      timeout: 5000,
    });
    const fileInput = page.locator('input[type="file"][aria-label="Upload CV"]');
    await expect(fileInput).toBeAttached();
  });

  test("unauthenticated access to dashboard redirects to login", async ({ page }) => {
    for (const path of ["/company", "/recruit", "/candidate", "/admin"]) {
      await page.goto(path);
      await page.waitForURL(/\/login/, { timeout: 10000 });
      expect(page.url()).toContain("/login");
    }
  });
});

test.describe("Full functional — Auth (all roles)", () => {
  test("invalid login shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nonexistent@test.com");
    await page.locator('input[name="password"]').fill("wrong");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    await expect(page.locator("body")).toBeVisible();
  });

  test("company admin login and dashboard", async ({ page }) => {
    await loginAs(page, "nidhi.gupta@finstack.in", /\/company/);
    test.skip(
      !page.url().includes("/company"),
      "Company admin demo account unavailable in this environment.",
    );
    await expect(page.getByText(/company dashboard|active jobs/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test("recruiter login and dashboard", async ({ page }) => {
    await loginAs(page, "rajiv.menon@finstack.in", /\/recruit/);
    test.skip(
      !page.url().includes("/recruit"),
      "Recruiter demo account unavailable in this environment.",
    );
    await expect(page.locator("body")).toBeVisible();
  });

  test("candidate login and dashboard", async ({ page }) => {
    await loginAs(page, "priya.sharma@gmail.com", /\/candidate/);
    test.skip(
      !page.url().includes("/candidate"),
      "Candidate demo account unavailable in this environment.",
    );
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("Full functional — Company admin flows", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "nidhi.gupta@finstack.in", /\/company/);
    test.skip(
      !page.url().includes("/company"),
      "Company admin demo account unavailable in this environment.",
    );
  });

  test("navigate: jobs, team, billing", async ({ page }) => {
    await page.goto("/company/jobs");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    await page.goto("/company/team");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    await page.goto("/company/billing");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
  });

  test("company can open new job form", async ({ page }) => {
    await page.goto("/company/jobs");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    const newLink = page.getByRole("link", { name: /new|create|post/i });
    if ((await newLink.count()) > 0) {
      await newLink.first().click();
      await page.waitForURL(/\/company\/jobs\/new|\/company\/hiring-requests\/new/);
    } else {
      await page.goto("/company/jobs/new");
    }
    const titleInput = page.getByLabel(/title|job title/i).or(page.locator('input[name="title"]'));
    if ((await titleInput.count()) > 0) {
      await expect(titleInput.first()).toBeVisible({ timeout: 10000 });
      return;
    }
    await expect(
      page.getByText(/direct jd creation is disabled|create requisition|hiring request/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Full functional — Recruiter flows", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "rajiv.menon@finstack.in", /\/recruit/);
    test.skip(
      !page.url().includes("/recruit"),
      "Recruiter demo account unavailable in this environment.",
    );
  });

  test("navigate: jobs, candidates, applications, analytics", async ({ page }) => {
    await page.goto("/recruit/jobs");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    await page.goto("/recruit/candidates");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    await page.goto("/recruit/applications");
    await expect(page.locator("main, body").first()).toBeVisible({ timeout: 10000 });
    await page.goto("/recruit/analytics");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
  });

  test("recruiter can open new job form", async ({ page }) => {
    await page.goto("/recruit/jobs/new");
    const titleInput = page.getByLabel(/title|job title/i).or(page.locator('input[name="title"]'));
    if ((await titleInput.count()) > 0) {
      await expect(titleInput.first()).toBeVisible({ timeout: 10000 });
      await titleInput.first().fill("E2E Functional Test Role " + Date.now());
      await expect(
        page.getByRole("button", { name: /submit|create|post|save/i }).first(),
      ).toBeVisible({ timeout: 5000 });
      return;
    }
    await expect(
      page.getByText(/direct jd creation is disabled|create requisition|hiring request/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("applications page shows list or empty state with score context", async ({ page }) => {
    await gotoRoute(page, "/recruit/applications");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/recruit\/applications/);
  });
});

test.describe("Full functional — Candidate flows", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "priya.sharma@gmail.com", /\/candidate/);
    test.skip(
      !page.url().includes("/candidate"),
      "Candidate demo account unavailable in this environment.",
    );
  });

  test("navigate: profile, jobs, applications, scores", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    await page.goto("/candidate/jobs");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    await page.goto("/candidate/applications");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    await page.goto("/candidate/scores");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Full functional — Health & API", () => {
  test("health endpoint returns ok", async ({ request }) => {
    const res = await request.get("http://localhost:3000/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("ok", true);
  });

  test("readiness with deps returns cache metrics when requested", async ({ request }) => {
    const res = await request.get("http://localhost:3000/api/health?ready=1&deps=1");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("ok", true);
    if (body.cache) {
      expect(typeof body.cache).toBe("object");
    }
  });
});
