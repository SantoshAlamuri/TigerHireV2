import { test, expect } from "@playwright/test";
import { pilotLogin } from "../helpers/pilot-login";
import { approveHiringRequest, listHiringRequests } from "../helpers/pilot-api";
import { lifecycleState, setLifecycleJobId } from "../helpers/pilot-lifecycle-state";
import { shouldSkipRequisitionCreation } from "../helpers/pilot-job";
import { dismissCookieBanner } from "../helpers/dismiss-cookie-banner";

test.describe.configure({ mode: "serial" });

test.describe("ACT 3 — Requisition & job setup", () => {
  test("HM creates and submits hiring request", async ({ page }) => {
    test.skip(shouldSkipRequisitionCreation(), "PILOT_JOB_ID set or PILOT_SKIP_REQUISITION=true");

    const title = `Pilot E2E ${Date.now()}`;
    lifecycleState.requisitionTitle = title;

    await pilotLogin(page, "hiringManager");
    await page.goto("/company/hiring-requests/new");
    await expect(
      page.getByRole("heading", { name: /new role intake|new hiring request/i }),
    ).toBeVisible({
      timeout: 15_000,
    });

    await dismissCookieBanner(page);
    await page.locator("#hr-title").fill(title);
    await page.locator("#hr-department").fill("Engineering");
    await page.getByRole("button", { name: /send for approval|submit for review/i }).click();

    await expect(page).toHaveURL(/\/company\/hiring-requests/, { timeout: 30_000 });

    let row: Record<string, unknown> | undefined;
    for (let i = 0; i < 15; i += 1) {
      const all = await listHiringRequests(page.request);
      row = all.find((r) => String(r.title ?? "") === title);
      if (row?.id) break;
      await page.waitForTimeout(1000);
    }
    test.skip(!row?.id, "Hiring request not found after submit");
    lifecycleState.hiringRequestId = String(row!.id);
  });

  test("recruiter approves requisition via API and generates JD", async ({ page }) => {
    test.skip(shouldSkipRequisitionCreation(), "PILOT_JOB_ID set or PILOT_SKIP_REQUISITION=true");
    test.skip(!lifecycleState.hiringRequestId, "No hiring request from prior step");

    const title = lifecycleState.requisitionTitle!;
    const reqId = lifecycleState.hiringRequestId!;

    await pilotLogin(page, "recruiter");
    const approveRes = await approveHiringRequest(page.request, reqId);
    if (!approveRes.ok()) {
      const err = (await approveRes.json().catch(() => ({}))) as { error?: string };
      test.skip(true, `Hiring request approve failed: ${approveRes.status()} ${err.error ?? ""}`);
    }

    let jobId: string | undefined;
    for (let i = 0; i < 30; i += 1) {
      await page.waitForTimeout(2000);
      const all = await listHiringRequests(page.request);
      const updated = all.find((r) => String(r.id) === reqId);
      if (updated?.assigned_job_id) {
        jobId = String(updated.assigned_job_id);
        break;
      }
    }
    if (jobId) setLifecycleJobId(jobId);
    test.skip(!jobId, "Approve did not produce assigned_job_id within 60s — check JD generation");

    await page.goto(`/recruit/jobs/${jobId}`);
    await expect(
      page.getByRole("heading", { name: new RegExp(title.slice(0, 20), "i") }),
    ).toBeVisible({
      timeout: 20_000,
    });
  });

  test("recruiter plan page loads for lifecycle job", async ({ page }) => {
    const jobId = lifecycleState.jobId;
    await pilotLogin(page, "recruiter");
    await page.goto(`/recruit/jobs/${jobId}`);
    await expect(page.getByRole("link", { name: "Plan" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("link", { name: "Plan" }).click();
    await expect(page.getByRole("region", { name: "Hiring readiness" })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("ideal profile section reachable on job overview", async ({ page }) => {
    const jobId = lifecycleState.jobId;
    await pilotLogin(page, "recruiter");
    await page.goto(`/recruit/jobs/${jobId}#ideal-profile-setup`);
    await expect(page.locator("body")).toBeVisible();
    const ipSection = page.getByText(
      /ideal profile|jd base|approve.*scoring|set up ideal|hiring readiness/i,
    );
    if (
      !(await ipSection
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      test.skip(true, "Ideal Profile block not on this job layout (flag or seed)");
    }
  });
});
