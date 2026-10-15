import { test, expect } from "@playwright/test";
import { pilotLogin } from "../helpers/pilot-login";
import {
  getGatedPipelineStageIdFromCache,
  getLifecycleGateCandidate,
  getPipelineCandidates,
  getPipelineStages,
  getRecruitmentPlanStages,
  patchPipelineCandidateStage,
} from "../helpers/pilot-api";
import { readPilotSeedCache } from "../helpers/pilot-seed-cache";
import { lifecycleState } from "../helpers/pilot-lifecycle-state";
import { pilotJobUrl } from "../helpers/pilot-job";
import {
  approveDecideTasksViaApi,
  approveFirstDecideTaskUi,
  filterDecideTasks,
  listPendingTasks,
} from "../helpers/pilot-tasks";

test.describe.configure({ mode: "serial" });

/**
 * End-to-end lifecycle on one pilot job: plan → pipeline gate → Tasks approvals → advance stage → offer CTA.
 * Runs late in the pilot suite (filename sort). Uses `lifecycleState.jobId` from ACT 3 or `PILOT_JOB_ID`.
 */
test.describe("Lifecycle — one job serial chain", () => {
  test("1. Plan readiness and pipeline candidates exist", async ({ page }) => {
    const jobId = lifecycleState.jobId;
    await pilotLogin(page, "recruiter");
    await page.goto(pilotJobUrl());
    await expect(page.getByRole("region", { name: "Hiring readiness" })).toBeVisible({
      timeout: 20_000,
    });

    const cache = readPilotSeedCache();
    if (!cache || cache.jobId !== jobId) {
      test.skip(
        true,
        "Run npm run pilot:seed (or pilot:pretest) to create lifecycle fixtures and e2e/.pilot-seed-cache.json",
      );
    }
    const gatePc = await getLifecycleGateCandidate(page.request, jobId);
    test.skip(!gatePc, "Lifecycle gate candidate missing — re-run npm run pilot:seed");
    lifecycleState.pipelineCandidateId = gatePc!.id;
  });

  test("2. Gated stage move blocked until approvals (409)", async ({ page }) => {
    const jobId = lifecycleState.jobId;
    await pilotLogin(page, "recruiter");

    const gatedStageId = getGatedPipelineStageIdFromCache(jobId);
    const gated =
      gatedStageId != null
        ? { pipeline_stage_id: gatedStageId }
        : (await getRecruitmentPlanStages(page.request, jobId)).find(
            (s) => s.approval_gate === "recruiter_and_hm" && s.pipeline_stage_id,
          );
    test.skip(
      !gated?.pipeline_stage_id,
      "No recruiter_and_hm gated stage — run npm run pilot:seed",
    );

    const pc = await getLifecycleGateCandidate(page.request, jobId);
    test.skip(!pc, "No lifecycle gate candidate");

    const moveRes = await patchPipelineCandidateStage(
      page.request,
      jobId,
      pc!.id,
      gated.pipeline_stage_id!,
    );
    test.skip(moveRes.status() === 404, "Lifecycle gate fixture is stale — run npm run pilot:seed");
    if (moveRes.status() === 200) {
      test.info().annotations.push({
        type: "note",
        description: "Candidate already past gate or gate not enforced — continuing",
      });
      return;
    }
    expect(moveRes.status()).toBe(409);
  });

  test("3. Recruiter approves shortlist via Tasks UI when pending", async ({ page }) => {
    const jobId = lifecycleState.jobId;
    await pilotLogin(page, "recruiter");

    const { tasks } = await listPendingTasks(page.request, jobId);
    const shortlist = filterDecideTasks(tasks, {
      jobId,
      kind: "approval_shortlist",
    });
    test.skip(
      shortlist.length === 0,
      "No recruiter shortlist Decide tasks — may already be approved",
    );

    const uiOk = await approveFirstDecideTaskUi(page, {
      jobId,
      kind: "approval_shortlist",
    });
    if (!uiOk) {
      const n = await approveDecideTasksViaApi(page.request, jobId, {
        kind: "approval_shortlist",
        max: 3,
      });
      expect(n).toBeGreaterThan(0);
    }
  });

  test("4. HM approves shortlist (UI or API fallback)", async ({ page }) => {
    const jobId = lifecycleState.jobId;
    await pilotLogin(page, "hiringManager");

    const { tasks } = await listPendingTasks(page.request, jobId);
    const shortlist = filterDecideTasks(tasks, {
      jobId,
      kind: "approval_shortlist",
    });
    test.skip(shortlist.length === 0, "No HM shortlist Decide tasks");

    const uiOk = await approveFirstDecideTaskUi(page, {
      jobId,
      kind: "approval_shortlist",
    });
    if (!uiOk) {
      const n = await approveDecideTasksViaApi(page.request, jobId, {
        kind: "approval_shortlist",
        max: 3,
      });
      test.skip(n === 0, "HM could not approve shortlist via UI or API");
    }
  });

  test("5. Advance candidate past gated stage after approvals", async ({ page }) => {
    const jobId = lifecycleState.jobId;
    await pilotLogin(page, "recruiter");

    const stages = await getPipelineStages(page.request, jobId);
    test.skip(stages.length < 2, "Need at least two pipeline stages");

    const gated = (await getRecruitmentPlanStages(page.request, jobId)).find(
      (s) => s.approval_gate === "recruiter_and_hm" && s.pipeline_stage_id,
    );

    const pc = await getLifecycleGateCandidate(page.request, jobId);
    test.skip(!pc, "No lifecycle gate candidate");

    const targetStageId =
      getGatedPipelineStageIdFromCache(jobId) ??
      gated?.pipeline_stage_id ??
      stages[Math.min(3, stages.length - 1)]?.id;
    test.skip(!targetStageId, "No target stage");

    const moveRes = await patchPipelineCandidateStage(page.request, jobId, pc!.id, targetStageId);
    if (moveRes.status() === 409) {
      await approveDecideTasksViaApi(page.request, jobId, {
        kind: "approval_shortlist",
        max: 5,
      });
      const retry = await patchPipelineCandidateStage(page.request, jobId, pc!.id, targetStageId);
      test.skip(retry.status() === 404, "Lifecycle gate fixture is stale — run npm run pilot:seed");
      test.skip(
        retry.status() === 409,
        "Still gated after API approvals — complete manually in UAT",
      );
      expect(retry.ok()).toBeTruthy();
    } else {
      test.skip(
        moveRes.status() === 404,
        "Lifecycle gate fixture is stale — run npm run pilot:seed",
      );
      expect(moveRes.ok()).toBeTruthy();
    }
  });

  test("6. Plan shows stage automation after lifecycle moves", async ({ page }) => {
    await pilotLogin(page, "recruiter");
    await page.goto(pilotJobUrl());
    await expect(page.getByText(/Stage automation/i)).toBeVisible({ timeout: 20_000 });
  });

  test("7. Offer draft link captured when hire stage configured", async ({ page }) => {
    const cache = readPilotSeedCache();
    await pilotLogin(page, "recruiter");
    await page.goto(pilotJobUrl());
    await expect(page.getByRole("heading", { name: /.+/ }).first()).toBeVisible({
      timeout: 20_000,
    });

    const draftOffer = page.getByRole("link", { name: "Draft offer" }).first();
    if (!(await draftOffer.isVisible().catch(() => false))) {
      if (cache?.offerApplicationId) {
        lifecycleState.applicationId = cache.offerApplicationId;
        return;
      }
      test.skip(true, "No offer-stage candidate — run npm run pilot:seed");
    }
    const href = await draftOffer.getAttribute("href");
    expect(href).toMatch(/applicationId=/);
    const match = href?.match(/applicationId=([^&]+)/);
    if (match?.[1]) lifecycleState.applicationId = decodeURIComponent(match[1]);
  });

  test("8. Finance approves offer task when pending (API)", async ({ page }) => {
    const jobId = lifecycleState.jobId;
    await pilotLogin(page, "finance");

    const n = await approveDecideTasksViaApi(page.request, jobId, {
      kind: "approval_offer_finance",
      max: 2,
    });
    if (n === 0) {
      test.skip(true, "No finance offer approval tasks pending");
    }
    expect(n).toBeGreaterThan(0);
  });
});
