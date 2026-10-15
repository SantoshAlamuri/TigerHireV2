import path from "node:path";
import { test, expect } from "@playwright/test";
import { applyPagePath } from "../helpers/apply-slug";
import { pilotLogin } from "../helpers/pilot-login";
import { pilotBaseUrl, normalizePilotPhone } from "../helpers/pilot-env";
import {
  buildMetaTextPayload,
  metaWhatsAppSecret,
  postWhatsAppWebhook,
  toMetaFromPhone,
} from "../helpers/whatsapp-webhook";

const RESUME = path.join(__dirname, "../fixtures/sample-resume.pdf");

test.describe("ACT 4.3 — Public apply", () => {
  test("careers apply page loads and accepts file input", async ({ page }) => {
    await page.goto(applyPagePath());
    await expect(page.getByRole("heading", { name: /apply|submit your (cv|resume)/i })).toBeVisible(
      {
        timeout: 15_000,
      },
    );
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput.first()).toBeAttached();
  });
});

test.describe("ACT 4.5 — Employee referral (dashboard)", () => {
  test("employee can open positions and refer someone form", async ({ page }) => {
    await pilotLogin(page, "employee");
    await expect(
      page
        .getByRole("link", { name: /refer.*earn/i })
        .or(page.getByText(/refer.*earn/i))
        .first(),
    ).toBeAttached({ timeout: 15_000 });

    const positionsLink = page.getByRole("link", { name: /positions|open roles/i }).first();
    if (await positionsLink.isVisible().catch(() => false)) {
      await positionsLink.click();
    } else {
      await page.goto(`${pilotBaseUrl()}/employee/positions`);
    }

    const referBtn = page.getByRole("button", { name: /refer someone/i }).first();
    if (!(await referBtn.isVisible().catch(() => false))) {
      test.skip(true, "No open positions for employee referral in this environment");
    }
    await referBtn.click();
    await expect(page.getByLabel(/name/i).or(page.getByPlaceholder(/name/i)).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("ACT 4.1 — WhatsApp referral (webhook simulation)", () => {
  test("referrer can send hi and start referral flow", async ({ request }) => {
    const secret = metaWhatsAppSecret();
    test.skip(!secret, "WHATSAPP_META_APP_SECRET not set — skip webhook simulation");

    const referrerPhone = normalizePilotPhone(process.env.PILOT_PHONE_SHATABDI);
    test.skip(!referrerPhone, "Set PILOT_PHONE_SHATABDI in .env.pilot-e2e.local");

    const hi = await postWhatsAppWebhook(
      request,
      buildMetaTextPayload({ from: referrerPhone, text: "hi" }),
    );
    expect(hi.skipped).toBeFalsy();
    expect(hi.ok).toBeTruthy();

    const refer = await postWhatsAppWebhook(
      request,
      buildMetaTextPayload({
        from: referrerPhone,
        text: "Referring Snigdha",
      }),
    );
    expect(refer.ok).toBeTruthy();

    const candidatePhone = normalizePilotPhone(process.env.PILOT_PHONE_SNIGDHA);
    if (candidatePhone) {
      const digits = toMetaFromPhone(candidatePhone);
      await postWhatsAppWebhook(
        request,
        buildMetaTextPayload({ from: referrerPhone, text: digits }),
      );
    }
  });
});

test.describe("ACT 4.4 — Agency dashboard", () => {
  test("agency dashboard loads after one-click login", async ({ page }) => {
    await pilotLogin(page, "agency");
    await expect(page).toHaveURL(/\/agency/, { timeout: 15_000 });
    await expect(page.locator("body")).toBeVisible();
  });
});
