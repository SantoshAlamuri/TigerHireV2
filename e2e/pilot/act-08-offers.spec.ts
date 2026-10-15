import { test, expect } from "@playwright/test";
import { pilotLogin } from "../helpers/pilot-login";
import { getPipelineCandidates } from "../helpers/pilot-api";
import { lifecycleState } from "../helpers/pilot-lifecycle-state";
import { pilotJobUrl } from "../helpers/pilot-job";

test.describe.configure({ mode: "serial" });

test.describe("ACT 8 — Offer & hire", () => {
  test("plan shows draft offer link when offer stage configured", async ({ page }) => {
    await pilotLogin(page, "recruiter");
    await page.goto(pilotJobUrl());
    await expect(page.getByRole("heading", { name: /.+/ }).first()).toBeVisible({
      timeout: 20_000,
    });

    const draftOffer = page.getByRole("link", { name: "Draft offer" }).first();
    if (!(await draftOffer.isVisible().catch(() => false))) {
      test.skip(true, "No offer-stage candidate or Draft offer CTA on this job");
    }
    const href = await draftOffer.getAttribute("href");
    expect(href).toMatch(/\/recruit\/offers\/draft\?applicationId=/);
    if (href) {
      const match = href.match(/applicationId=([^&]+)/);
      if (match?.[1]) lifecycleState.applicationId = decodeURIComponent(match[1]);
    }
  });

  test("offer draft form loads with save action", async ({ page }) => {
    test.skip(!lifecycleState.applicationId, "No applicationId from Draft offer link");

    await pilotLogin(page, "recruiter");
    await page.goto(
      `/recruit/offers/draft?applicationId=${encodeURIComponent(lifecycleState.applicationId!)}`,
    );
    await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });
    const saveBtn = page.getByRole("button", { name: /save draft.*approval/i });
    await expect(saveBtn.first()).toBeVisible({ timeout: 20_000 });
  });

  test("finance inbox accessible for offer approvals", async ({ page }) => {
    await pilotLogin(page, "finance");
    await page.goto("/company/finance");
    await expect(page.getByRole("heading", { name: /offer approvals|finance/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("HM tasks inbox loads for offer-related approvals", async ({ page }) => {
    await pilotLogin(page, "hiringManager");
    await page.goto(`/tasks?jobId=${encodeURIComponent(lifecycleState.jobId)}`);
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({ timeout: 15_000 });
  });
});
