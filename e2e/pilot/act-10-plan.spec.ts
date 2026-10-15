import { test, expect } from "@playwright/test";
import { pilotLogin } from "../helpers/pilot-login";
import { pilotJobId } from "../helpers/pilot-env";

const QA_JOB_ID = pilotJobId() ?? "861e8c58-9c72-4c46-8534-a02207a35cbc";
const QA_JOB_URL = `/recruit/jobs/${QA_JOB_ID}`;

test.describe("ACT 10 — Plan command center", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await Promise.race([
      pilotLogin(page, "recruiter").then(() => true),
      page.waitForTimeout(35_000).then(() => false),
    ]);
    test.skip(!loggedIn, "Recruiter login unavailable");
  });

  test("plan page shows readiness, automation, and tasks", async ({ page }) => {
    await page.goto(QA_JOB_URL);
    await expect(page.getByRole("region", { name: "Hiring readiness" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Stage automation/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your tasks" })).toBeVisible();
  });

  test("approval gate returns 409 without required approval", async ({ page }) => {
    const stagesRes = await page.request.get(`/api/jobs/${QA_JOB_ID}/pipeline-stages`);
    test.skip(!stagesRes.ok(), "Could not load pipeline stages");

    const stagesJson = (await stagesRes.json()) as {
      data?: { stages?: Array<{ id: string }> };
    };
    test.skip((stagesJson.data?.stages ?? []).length < 2, "Need pipeline stages");

    const planRes = await page.request.get(`/api/jobs/${QA_JOB_ID}/recruitment-plan`);
    test.skip(!planRes.ok(), "No recruitment plan");

    const planJson = (await planRes.json()) as {
      data?: {
        stages?: Array<{
          pipeline_stage_id: string | null;
          approval_gate: string;
        }>;
      };
    };
    const gated = (planJson.data?.stages ?? []).find(
      (s) => s.approval_gate === "recruiter_and_hm" && s.pipeline_stage_id,
    );
    test.skip(!gated, "No gated stage on this job");

    const pcRes = await page.request.get(`/api/jobs/${QA_JOB_ID}/pipeline/candidates?limit=5`);
    test.skip(!pcRes.ok(), "Could not list pipeline candidates");

    const pcJson = (await pcRes.json()) as {
      data?: { candidates?: Array<{ id: string }> };
    };
    const pc = pcJson.data?.candidates?.[0];
    test.skip(!pc, "No pipeline candidates");

    const moveRes = await page.request.patch(
      `/api/jobs/${QA_JOB_ID}/pipeline/candidates/${pc.id}`,
      { data: { stage_id: gated!.pipeline_stage_id } },
    );
    expect(moveRes.status()).toBe(409);
  });
});
