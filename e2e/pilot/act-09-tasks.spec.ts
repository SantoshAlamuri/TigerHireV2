import { test, expect } from "@playwright/test";
import { pilotLogin } from "../helpers/pilot-login";
import { getPilotJobId } from "../helpers/pilot-job";
import { approveFirstDecideTaskUi } from "../helpers/pilot-tasks";

const QA_JOB_ID = getPilotJobId();

test.describe("ACT 9 — Tasks command center", () => {
  test("recruiter: tasks inbox, filters, Decide drawer", async ({ page }) => {
    await pilotLogin(page, "recruiter");
    await page.goto(`/tasks?jobId=${QA_JOB_ID}`);
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({ timeout: 15_000 });

    await expect(page.getByLabel("Filter tasks by job")).toBeVisible();
    await expect(page.getByRole("tab", { name: /All/i })).toBeVisible();
    await expect(page.getByLabel("Filter tasks by phase")).toBeVisible();

    const approved = await approveFirstDecideTaskUi(page, { jobId: QA_JOB_ID });
    if (!approved) {
      const decideBtn = page.getByRole("button", { name: "Decide" }).first();
      if (await decideBtn.isVisible().catch(() => false)) {
        await decideBtn.click();
        await expect(page.getByRole("dialog", { name: "Complete task" })).toBeVisible();
        await page.keyboard.press("Escape");
      }
    }
  });

  test("finance: finance inbox loads (not /tasks — role-scoped)", async ({ page }) => {
    await pilotLogin(page, "finance");
    await page.goto("/company/finance");
    await expect(page.getByRole("heading", { name: /offer approvals|finance/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("interviewer: interviews queue loads (not /tasks — role-scoped)", async ({ page }) => {
    await pilotLogin(page, "interviewer");
    await page.goto("/company/interviews");
    await expect(page.getByRole("heading", { name: /interview/i })).toBeVisible({
      timeout: 15_000,
    });
  });
});
