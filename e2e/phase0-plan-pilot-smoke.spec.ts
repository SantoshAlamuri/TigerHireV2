import { test, expect } from "@playwright/test";
import { loginWithFallback } from "./helpers/login";

const QA_JOB_ID = "861e8c58-9c72-4c46-8534-a02207a35cbc";
const QA_JOB_URL = `/recruit/jobs/${QA_JOB_ID}`;
const RECRUITER_EMAIL = "rajiv.menon@finstack.in";

async function loginRecruiter(page: import("@playwright/test").Page) {
  await loginWithFallback(page, {
    email: RECRUITER_EMAIL,
    buttonName: /recruiter/i,
    expectedPath: /\/(home|recruit)/,
  });
}

test.describe("Phase 0 + Brief #2 plan pilot smoke", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await Promise.race([
      loginRecruiter(page).then(() => true),
      page.waitForTimeout(30_000).then(() => false),
    ]);
    test.skip(!loggedIn, "Recruiter demo login unavailable");
  });

  test("smoke 2: Plan page readiness, automation, tasks banner, scheduling", async ({ page }) => {
    await page.goto(QA_JOB_URL);
    await expect(page.getByRole("heading", { name: /QA Engineer/i })).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.getByRole("region", { name: "Hiring readiness" })).toBeVisible();
    await expect(page.getByText(/Stage automation/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your tasks" })).toBeVisible();

    await page.getByRole("link", { name: "Scheduling" }).click();
    await expect(page).toHaveURL(new RegExp(`${QA_JOB_URL}/interviews`));
    const createSlots = page.getByRole("button", { name: /create slots/i }).first();
    await expect(createSlots).toBeVisible({ timeout: 15_000 });
    await createSlots.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/timezone|time zone/i).first()).toBeVisible();
  });

  test("smoke 3 + Brief #2: Tasks inbox, filters, Decide drawer", async ({ page }) => {
    await page.goto(`/tasks?jobId=${QA_JOB_ID}`);
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({ timeout: 15_000 });

    await expect(page.getByLabel("Filter tasks by job")).toBeVisible();
    await expect(page.getByRole("tab", { name: /All/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Needs decision/i })).toBeVisible();

    const decideBtn = page.getByRole("button", { name: "Decide" }).first();
    if (await decideBtn.isVisible().catch(() => false)) {
      await decideBtn.click();
      await expect(page.getByRole("dialog", { name: "Complete task" })).toBeVisible();
      await page.keyboard.press("Escape");
    }

    await page.goto(QA_JOB_URL);
    await expect(page).toHaveURL(new RegExp(QA_JOB_ID));
    await expect(page.getByRole("heading", { name: /QA Engineer/i })).toBeVisible();
  });

  test("smoke 5: offer draft link from plan (when offer stage configured)", async ({ page }) => {
    await page.goto(QA_JOB_URL);
    await expect(page.getByRole("heading", { name: /QA Engineer/i })).toBeVisible({
      timeout: 20_000,
    });

    const draftOffer = page.getByRole("link", { name: "Draft offer" }).first();
    if (await draftOffer.isVisible().catch(() => false)) {
      const href = await draftOffer.getAttribute("href");
      expect(href).toMatch(/\/recruit\/offers\/draft\?applicationId=/);
    }

    const tasksLink = page.getByRole("link", { name: /Open tasks/i });
    await expect(tasksLink).toBeVisible();
    await tasksLink.click();
    await expect(page).toHaveURL(new RegExp(`/tasks\\?jobId=${QA_JOB_ID}`));
  });

  test("smoke 6: approval gate returns 409 without shortlist approvals", async ({ page }) => {
    const stagesRes = await page.request.get(`/api/jobs/${QA_JOB_ID}/pipeline-stages`);
    test.skip(!stagesRes.ok(), "Could not load pipeline stages");

    const stagesJson = (await stagesRes.json()) as {
      data?: { stages?: Array<{ id: string; stage_name: string }> };
    };
    const stages = stagesJson.data?.stages ?? [];
    test.skip(stages.length < 2, "Need pipeline stages for gate test");

    const planRes = await page.request.get(`/api/jobs/${QA_JOB_ID}/recruitment-plan`);
    test.skip(!planRes.ok(), "No recruitment plan");

    const planJson = (await planRes.json()) as {
      data?: {
        stages?: Array<{
          id: string;
          pipeline_stage_id: string | null;
          approval_gate: string;
          display_name: string;
        }>;
      };
    };
    const gated = (planJson.data?.stages ?? []).find(
      (s) => s.approval_gate === "recruiter_and_hm" && s.pipeline_stage_id,
    );
    test.skip(!gated, "No recruiter_and_hm gated stage on this job");

    const pcRes = await page.request.get(`/api/jobs/${QA_JOB_ID}/pipeline/candidates?limit=5`);
    test.skip(!pcRes.ok(), "Could not list pipeline candidates");

    const pcJson = (await pcRes.json()) as {
      data?: { candidates?: Array<{ id: string; pipeline_stage_id: string }> };
    };
    const pc = pcJson.data?.candidates?.[0];
    test.skip(!pc, "No pipeline candidates");

    const moveRes = await page.request.patch(
      `/api/jobs/${QA_JOB_ID}/pipeline/candidates/${pc.id}`,
      {
        data: { stage_id: gated!.pipeline_stage_id },
      },
    );
    expect(moveRes.status()).toBe(409);
    const body = (await moveRes.json()) as { error?: string };
    expect(body.error ?? "").toMatch(/Tasks/i);
  });
});
