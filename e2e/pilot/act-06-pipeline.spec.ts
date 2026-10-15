import { test, expect } from "@playwright/test";
import { pilotLogin } from "../helpers/pilot-login";
import {
  getPipelineCandidates,
  getPipelineStages,
  getRecruitmentPlanStages,
  patchPipelineCandidateStage,
} from "../helpers/pilot-api";
import { lifecycleState } from "../helpers/pilot-lifecycle-state";
import { pilotJobUrl } from "../helpers/pilot-job";
import { approveFirstDecideTaskUi } from "../helpers/pilot-tasks";

test.describe.configure({ mode: "serial" });

test.describe("ACT 6 — Pipeline & plan automation", () => {
  test("recruiter opens job pipeline", async ({ page }) => {
    await pilotLogin(page, "recruiter");
    await page.goto(`/recruit/pipeline?jobId=${encodeURIComponent(lifecycleState.jobId)}`);
    await expect(page).toHaveURL(/\/recruit\/pipeline/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("gated stage move returns 409 without approvals", async ({ page }) => {
    await pilotLogin(page, "recruiter");
    const jobId = lifecycleState.jobId;
    const gated = (await getRecruitmentPlanStages(page.request, jobId)).find(
      (s) => s.approval_gate === "recruiter_and_hm" && s.pipeline_stage_id,
    );
    test.skip(!gated, "No recruiter_and_hm gated stage");

    const pc = (await getPipelineCandidates(page.request, jobId, 5))[0];
    test.skip(!pc, "No pipeline candidates");

    const moveRes = await patchPipelineCandidateStage(
      page.request,
      jobId,
      pc.id,
      gated!.pipeline_stage_id!,
    );
    expect(moveRes.status()).toBe(409);
    const body = (await moveRes.json()) as { error?: string };
    expect(body.error ?? "").toMatch(/Tasks|approval/i);
  });

  test("recruiter can move candidate to next stage when not gated", async ({ page }) => {
    await pilotLogin(page, "recruiter");
    const jobId = lifecycleState.jobId;
    const stages = await getPipelineStages(page.request, jobId);
    test.skip(stages.length < 2, "Need at least two pipeline stages");

    const pc = (await getPipelineCandidates(page.request, jobId, 5))[0];
    test.skip(!pc, "No pipeline candidates");
    lifecycleState.pipelineCandidateId = pc.id;

    const currentStageId = pc.pipeline_stage_id ?? pc.stage_id ?? stages[0]?.id;
    const currentIdx = stages.findIndex((s) => s.id === currentStageId);
    const nextStage = stages[currentIdx >= 0 ? currentIdx + 1 : 1] ?? stages[1];
    test.skip(!nextStage?.id, "No next stage");

    const moveRes = await patchPipelineCandidateStage(page.request, jobId, pc.id, nextStage.id);
    if (moveRes.status() === 409) {
      test.skip(true, "Stage gated — complete shortlist approvals in Tasks first");
    }
    expect(moveRes.ok()).toBeTruthy();
  });

  test("shortlist approval via Tasks Decide drawer when pending", async ({ page }) => {
    await pilotLogin(page, "recruiter");
    const jobId = lifecycleState.jobId;
    const approved = await approveFirstDecideTaskUi(page, {
      jobId,
      kind: "approval_shortlist",
    });
    test.skip(!approved, "No Decide tasks pending for this job");
  });

  test("HM can open tasks for owned jobs", async ({ page }) => {
    await pilotLogin(page, "hiringManager");
    await page.goto(`/tasks?jobId=${encodeURIComponent(lifecycleState.jobId)}`);
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({ timeout: 15_000 });
  });

  test("plan page shows automation chip after pipeline activity", async ({ page }) => {
    await pilotLogin(page, "recruiter");
    await page.goto(pilotJobUrl());
    await expect(page.getByText(/Stage automation/i)).toBeVisible({ timeout: 20_000 });
  });
});
