import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { ActionableTask } from "@/lib/tasks/actionable-task-types";
import { pilotApiHeaders } from "./pilot-api";

export type PendingTasksResponse = {
  tasks: ActionableTask[];
  meta?: { total?: number };
};

export async function listPendingTasks(
  request: APIRequestContext,
  jobId?: string,
): Promise<PendingTasksResponse> {
  const url = jobId
    ? `/api/tasks/pending?jobId=${encodeURIComponent(jobId)}`
    : "/api/tasks/pending";
  const res = await request.get(url, { headers: pilotApiHeaders() });
  if (!res.ok()) return { tasks: [] };
  const json = (await res.json()) as {
    data?: PendingTasksResponse;
    tasks?: ActionableTask[];
    meta?: PendingTasksResponse["meta"];
  };
  const data = json.data ?? json;
  return {
    tasks: data.tasks ?? [],
    meta: data.meta,
  };
}

export function filterDecideTasks(
  tasks: ActionableTask[],
  opts?: { jobId?: string; kind?: ActionableTask["kind"] },
): ActionableTask[] {
  return tasks.filter((t) => {
    if (t.action_shape !== "decide") return false;
    if (opts?.jobId && t.job_id !== opts.jobId) return false;
    if (opts?.kind && t.kind !== opts.kind) return false;
    return t.kind.startsWith("approval_");
  });
}

export async function postTaskDecision(
  request: APIRequestContext,
  task: ActionableTask,
  decision: "approved" | "rejected" = "approved",
): Promise<{ ok: boolean; status: number; error?: string }> {
  const body: Record<string, unknown> = { decision, comment: "Pilot E2E approval" };
  if (task.kind === "approval_shortlist") {
    if (!task.job_id || !task.candidate_id) {
      return { ok: false, status: 400, error: "Missing job or candidate on shortlist task" };
    }
    body.jobId = task.job_id;
    body.candidateId = task.candidate_id;
  } else if (task.kind === "approval_requisition") {
    body.requestId = task.request_id;
    if (!body.requestId) return { ok: false, status: 400, error: "Missing request_id" };
  } else if (task.kind === "approval_offer_finance") {
    body.offerId = task.offer_id;
    if (!body.offerId) return { ok: false, status: 400, error: "Missing offer_id" };
  } else {
    return { ok: false, status: 400, error: "Unsupported task kind for API decision" };
  }

  const res = await request.post(`/api/approvals/tasks/${task.id}/decision`, {
    data: body,
    headers: pilotApiHeaders(),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: res.ok(), status: res.status(), error: json.error };
}

/**
 * Open Tasks, click Decide on the first matching row, Approve, and assert the drawer closes.
 */
export async function approveFirstDecideTaskUi(
  page: Page,
  opts?: { jobId?: string; kind?: ActionableTask["kind"] },
): Promise<boolean> {
  const query = new URLSearchParams();
  if (opts?.jobId) query.set("jobId", opts.jobId);
  if (opts?.kind === "approval_shortlist") query.set("category", "approvals");
  const qs = query.toString();
  await page.goto(`/tasks${qs ? `?${qs}` : ""}`);
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({ timeout: 15_000 });

  const decideBtn = page.getByRole("button", { name: "Decide" }).first();
  if (!(await decideBtn.isVisible().catch(() => false))) return false;

  await decideBtn.click();
  const dialog = page.getByRole("dialog", { name: "Complete task" });
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  const approve = dialog.getByRole("button", { name: /^Approve$/i });
  await expect(approve).toBeVisible({ timeout: 5_000 });
  await approve.click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  return true;
}

/** Approve up to `max` decide tasks for a job via API (fast path when UI is flaky). */
export async function approveDecideTasksViaApi(
  request: APIRequestContext,
  jobId: string,
  opts?: { kind?: ActionableTask["kind"]; max?: number },
): Promise<number> {
  const max = opts?.max ?? 5;
  let approved = 0;
  for (let round = 0; round < max; round += 1) {
    const { tasks } = await listPendingTasks(request, jobId);
    const pending = filterDecideTasks(tasks, { jobId, kind: opts?.kind });
    const task = pending[0];
    if (!task) break;
    const result = await postTaskDecision(request, task, "approved");
    if (!result.ok) break;
    approved += 1;
  }
  return approved;
}
