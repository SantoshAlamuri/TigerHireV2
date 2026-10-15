import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { dismissCookieBanner } from "../helpers/dismiss-cookie-banner";

async function signIn(page: Page, email: string, landing: RegExp) {
  await page.goto("/login");
  await dismissCookieBanner(page);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.locator('input[name="password"]').fill(process.env.SEED_DEMO_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(landing, { timeout: 30_000 });
}

test("anonymous users cannot read hiring requests", async ({ request }) => {
  expect((await request.get("/api/hiring-requests")).status()).toBe(401);
});

test("recruiter saves and reloads a draft; candidate cannot read it", async ({
  page,
  browser,
}, testInfo) => {
  const title = `Release verification ${randomUUID()}`;
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  // The release runner validates the exact preview target before this test is invoked.
  let id: string | undefined;
  try {
    await signIn(page, "rajiv.menon@finstack.in", /\/recruit/);
    await page.goto("/company/hiring-requests/new");
    await expect(page.getByRole("heading", { name: "Request a role" })).toBeVisible();
    await page.locator("#hr-title").fill(title);
    await page.locator("#hr-budget-min").fill("1200000");
    await page.locator("#hr-budget-max").fill("1800000");
    await dismissCookieBanner(page);
    await expect(page.locator("body")).toHaveJSProperty(
      "scrollWidth",
      await page.locator("body").evaluate((body) => body.clientWidth),
    );
    await page.screenshot({ path: testInfo.outputPath("role-request.png"), fullPage: true });
    const saved = page.waitForResponse(
      (res) => res.url().endsWith("/api/hiring-requests") && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    const response = await saved;
    expect(response.status()).toBe(201);
    const body = await response.json();
    id = body.request?.id;
    expect(id).toMatch(/^[a-f0-9-]{36}$/);
    await page.reload();
    const persisted = await page.request.get(`/api/hiring-requests/${id}`);
    expect(persisted.ok()).toBe(true);
    expect((await persisted.json()).request).toMatchObject({
      title,
      status: "draft",
      budget_ctc_min: 1200000,
      budget_ctc_max: 1800000,
    });
    const candidate = await browser.newContext();
    try {
      const candidatePage = await candidate.newPage();
      await signIn(candidatePage, "priya.sharma@gmail.com", /\/candidate/);
      expect((await candidate.request.get(`/api/hiring-requests/${id}`)).status()).toBe(403);
    } finally {
      await candidate.close();
    }
  } finally {
    // Exact unique title also covers a successful POST whose response was interrupted.
    const { error } = await admin.from("hiring_requests").delete().eq("title", title);
    expect(error, "Release fixture cleanup failed").toBeNull();
  }
});
