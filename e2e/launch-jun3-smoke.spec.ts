import { test, expect } from "@playwright/test";

/**
 * P1 / Agent A: ultra-light smoke (public routes respond). Not a full E2E; human run + punch list is authoritative.
 * Public-apply phone WhatsApp (template vs session fallback) is covered in `tests/unit/public-apply-whatsapp-nudge.test.ts` (Meta Cloud API).
 */
test.describe("Launch Jun3 smoke (public)", () => {
  test("home and pricing load", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.ok() ?? true).toBeTruthy();
    await expect(page.getByRole("link", { name: /privacy policy/i }).first()).toBeVisible();

    const pr = await page.goto("/pricing");
    expect(pr?.ok() ?? true).toBeTruthy();
  });

  test("invalid schedule token returns not ok", async ({ request }) => {
    const r = await request.get("/api/schedule/self-serve/0000000000000000000000000000");
    expect(r.status(), await r.text()).toBeGreaterThanOrEqual(400);
  });
});
