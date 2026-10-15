import type { SupabaseClient } from "@supabase/supabase-js";
import { getDualApprovalStatus } from "@/lib/pipeline-approvals";
import { listHiringManagerJobIds } from "@/lib/jobs/hiring-manager-job-ids";
import { listUserAvailabilityWindows } from "@/lib/interviews/interviewer-availability";
import { isPlanAutoExecuteEnabled } from "@/lib/recruitment-plan/plan-auto-execute-flags";
import { withResolvedPendingHrefs } from "./resolve-pending-task-href";
import type { PlanPendingTaskUrgency } from "./plan-pending-types";

function urgencyFromAgeHours(hours: number): PlanPendingTaskUrgency {
  if (hours >= 48) return "overdue";
  if (hours >= 24) return "due_today";
  if (hours >= 4) return "upcoming";
  return "normal";
}

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

export type PendingTaskKind =
  | "approval"
  | "feedback"
  | "slot_picker"
  | "interviewer_assignment"
  | "plan_exception"
  | "interviewer_availability";

export type OrgPendingTask = {
  id: string;
  kind: PendingTaskKind;
  title: string;
  description: string;
  jobId: string;
  jobTitle: string;
  href: string;
  candidateId?: string;
  pipelineStageName?: string;
  createdAt?: string;
  urgency?: PlanPendingTaskUrgency;
};

export async function listOrgPendingTasks(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  params: {
    organisationId: string;
    userId: string;
    role: string;
    /** When set, only tasks for this job (Plan page). */
    jobId?: string;
    /** When true, skip shortlist approval rows (use listPendingApprovalItems instead). */
    skipApprovals?: boolean;
  },
): Promise<OrgPendingTask[]> {
  const tasks: OrgPendingTask[] = [];

  let jobFilter: string[] | null = null;
  if (params.role === "hiring_manager") {
    jobFilter = await listHiringManagerJobIds(supabase, params.organisationId, params.userId);
    if (jobFilter.length === 0) return [];
  }

  if (params.jobId && jobFilter && !jobFilter.includes(params.jobId)) {
    return [];
  }

  let jobRows: { id: string; title: string | null }[];
  if (params.jobId) {
    const { data: job, error } = await supabase
      .from("jobs")
      .select("id, title")
      .eq("id", params.jobId)
      .eq("organisation_id", params.organisationId)
      .maybeSingle();
    if (error || !job?.id) return [];
    jobRows = [{ id: job.id as string, title: job.title as string | null }];
  } else {
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, title")
      .eq("organisation_id", params.organisationId)
      .in("status", ["open", "active", "paused"]);

    jobRows = (jobs ?? []).filter((j) =>
      jobFilter ? jobFilter.includes(j.id as string) : true,
    ) as { id: string; title: string | null }[];
  }

  const jobTitleById = new Map(jobRows.map((j) => [j.id, (j.title as string | null) ?? "Role"]));

  let pickersQuery = admin
    .from("interview_slot_picker_requests")
    .select("id, job_id, pipeline_candidate_id, candidate_id, sent_at, candidates(name, full_name)")
    .eq("organisation_id", params.organisationId)
    .eq("status", "pending");
  if (params.jobId) {
    pickersQuery = pickersQuery.eq("job_id", params.jobId);
  }
  const { data: pickers } = await pickersQuery;

  for (const row of pickers ?? []) {
    const jobId = row.job_id as string;
    if (!jobTitleById.has(jobId)) continue;
    const cand = row.candidates as { name?: string; full_name?: string } | null;
    const candName = cand?.full_name ?? cand?.name ?? "Candidate";
    const sentAt = (row.sent_at as string | null) ?? new Date().toISOString();
    tasks.push({
      id: `slot:${row.id}`,
      kind: "slot_picker",
      title: `Slot picker awaiting response — ${candName}`,
      description: "WhatsApp slot picker sent — awaiting response",
      jobId,
      jobTitle: jobTitleById.get(jobId) ?? "Role",
      href: `/recruit/jobs/${jobId}/interviews`,
      candidateId: row.candidate_id as string,
      createdAt: sentAt,
      urgency: urgencyFromAgeHours(hoursSince(sentAt)),
    });
  }

  const jobIds = [...jobTitleById.keys()];
  if (jobIds.length === 0) return tasks;

  const { data: pipelineRows } = await supabase
    .from("pipeline_candidates")
    .select(
      `id, job_id, candidate_id, interview_scheduled_at, stage_id, created_at,
       pipeline_stages(stage_name, interviewer_user_id, interviewer_name),
       candidates(name, full_name),
       feedback_responses(id)`,
    )
    .in("job_id", jobIds)
    .eq("status", "in_progress");

  for (const pc of pipelineRows ?? []) {
    const jobId = pc.job_id as string;
    const stage = pc.pipeline_stages as {
      stage_name?: string | null;
      interviewer_user_id?: string | null;
      interviewer_name?: string | null;
    } | null;
    const stageName = stage?.stage_name ?? "Stage";
    const cand = pc.candidates as { name?: string; full_name?: string } | null;
    const candName = cand?.full_name ?? cand?.name ?? "Candidate";
    const candidateId = pc.candidate_id as string;
    const hasInterviewer = Boolean(stage?.interviewer_user_id || stage?.interviewer_name);
    if (!hasInterviewer && stageName.toLowerCase().includes("interview")) {
      tasks.push({
        id: `iv:${pc.id}`,
        kind: "interviewer_assignment",
        title: `Assign interviewer — ${stageName}`,
        description: `${stageName} has no primary interviewer`,
        jobId,
        jobTitle: jobTitleById.get(jobId) ?? "Role",
        href: `/recruit/jobs/${jobId}`,
        candidateId,
        pipelineStageName: stageName,
        createdAt: (pc.created_at as string | null) ?? undefined,
        urgency: "due_today",
      });
    }

    if (pc.interview_scheduled_at) {
      const feedback = (pc.feedback_responses ?? []) as unknown[];
      const feedbackCount = Array.isArray(feedback) ? feedback.length : 0;
      const scheduledAt = pc.interview_scheduled_at as string;
      const ended = new Date(scheduledAt).getTime() < Date.now();
      if (ended && feedbackCount === 0) {
        tasks.push({
          id: `fb:${pc.id}`,
          kind: "feedback",
          title: `Interview feedback pending — ${candName}`,
          description: `Scorecard due for ${stageName}`,
          jobId,
          jobTitle: jobTitleById.get(jobId) ?? "Role",
          href: `/recruit/jobs/${jobId}/feedback`,
          candidateId,
          pipelineStageName: stageName,
          createdAt: scheduledAt,
          urgency: urgencyFromAgeHours(hoursSince(scheduledAt)),
        });
      }
    }
  }

  if (!params.skipApprovals) {
    for (const pc of pipelineRows ?? []) {
      const jobId = pc.job_id as string;
      const stage = pc.pipeline_stages as { stage_name?: string | null } | null;
      const stageName = stage?.stage_name ?? "Stage";
      const cand = pc.candidates as { name?: string; full_name?: string } | null;
      const candName = cand?.full_name ?? cand?.name ?? "Candidate";
      const { recruiterApproved, hmApproved } = await getDualApprovalStatus(admin, pc.id as string);
      if (!recruiterApproved || !hmApproved) {
        tasks.push({
          id: `ap:${pc.id}`,
          kind: "approval",
          title: `Shortlist approval needed — ${candName}`,
          description: !recruiterApproved
            ? "Recruiter verification pending"
            : "Hiring manager approval pending",
          jobId,
          jobTitle: jobTitleById.get(jobId) ?? "Role",
          href: `/recruit/jobs/${jobId}/candidates`,
          candidateId: pc.candidate_id as string,
          pipelineStageName: stageName,
          createdAt: (pc.created_at as string | null) ?? undefined,
          urgency: "normal",
        });
      }
    }
  }

  if (params.jobId) {
    const { data: plan } = await admin
      .from("recruitment_plans")
      .select("id")
      .eq("job_id", params.jobId)
      .maybeSingle();
    if (plan?.id) {
      const { data: unassignedPlanStages } = await admin
        .from("plan_stages")
        .select("id, display_name")
        .eq("plan_id", plan.id as string)
        .eq("stage_type", "interview")
        .is("primary_interviewer_id", null)
        .eq("is_active", true);
      for (const ps of unassignedPlanStages ?? []) {
        const stageName = (ps.display_name as string) ?? "Interview";
        tasks.push({
          id: `plan-iv:${ps.id}`,
          kind: "interviewer_assignment",
          title: `Assign interviewer for ${stageName}`,
          description: "Interview plan stage has no primary interviewer",
          jobId: params.jobId,
          jobTitle: jobTitleById.get(params.jobId) ?? "Role",
          href: `/recruit/jobs/${params.jobId}`,
          pipelineStageName: stageName,
          urgency: "due_today",
        });
      }
    }
  }

  if (isPlanAutoExecuteEnabled()) {
    const { data: orgPlans } = await admin
      .from("recruitment_plans")
      .select("id")
      .eq("organisation_id", params.organisationId);
    const orgPlanIds = (orgPlans ?? []).map((p) => p.id as string);

    const { data: exceptions } =
      orgPlanIds.length > 0
        ? await admin
            .from("plan_candidate_stage_tracking")
            .select(
              `id, job_id, candidate_id, entered_at, exception_detected_at,
         plan_stages!inner(display_name, stage_type, target_dwell_days),
         candidates(name, full_name)`,
            )
            .in("plan_id", orgPlanIds)
            .not("exception_detected_at", "is", null)
        : { data: [] };

    for (const row of exceptions ?? []) {
      const jobId = row.job_id as string;
      if (!jobTitleById.has(jobId)) continue;
      const planStageRaw = row.plan_stages;
      const stage = (Array.isArray(planStageRaw) ? planStageRaw[0] : planStageRaw) as {
        display_name: string;
        target_dwell_days?: number | null;
      };
      const cand = row.candidates as { name?: string; full_name?: string } | null;
      const name = cand?.full_name ?? cand?.name ?? "Candidate";
      const enteredAt = row.entered_at as string;
      const exceptionAt = (row.exception_detected_at as string | null) ?? enteredAt;
      const entered = new Date(enteredAt);
      const days = Math.floor((Date.now() - entered.getTime()) / 86400000);
      const targetDwell = Number(stage.target_dwell_days ?? 5);
      const urgency: PlanPendingTaskUrgency =
        days >= targetDwell
          ? "overdue"
          : days >= Math.max(1, targetDwell - 1)
            ? "due_today"
            : "upcoming";
      tasks.push({
        id: `pex:${row.id}`,
        kind: "plan_exception",
        title: `Plan stage overdue — ${name}`,
        description: `${name} stuck in ${stage.display_name} (${days}d)`,
        jobId,
        jobTitle: jobTitleById.get(jobId) ?? "Role",
        href: `/recruit/jobs/${jobId}`,
        candidateId: row.candidate_id as string,
        pipelineStageName: stage.display_name,
        createdAt: exceptionAt,
        urgency,
      });
    }

    for (const pc of pipelineRows ?? []) {
      const jobId = pc.job_id as string;
      const stage = pc.pipeline_stages as { stage_name?: string | null } | null;
      if (!stage?.stage_name?.toLowerCase().includes("interview")) continue;

      const { data: plan } = await admin
        .from("recruitment_plans")
        .select("id")
        .eq("job_id", jobId)
        .maybeSingle();
      if (!plan?.id) continue;

      const { data: planStages } = await admin
        .from("plan_stages")
        .select("id, primary_interviewer_id, display_name")
        .eq("plan_id", plan.id as string)
        .eq("stage_type", "interview")
        .eq("is_active", true);

      for (const planStage of planStages ?? []) {
        const interviewerId = planStage.primary_interviewer_id as string | null;
        if (!interviewerId) continue;

        const windows = await listUserAvailabilityWindows(admin, {
          userId: interviewerId,
          organisationId: params.organisationId,
          activeOnly: true,
        });
        if (windows.length > 0) continue;

        const displayName = (planStage.display_name as string) ?? "Interview";
        tasks.push({
          id: `iva:${plan.id}:${planStage.id}`,
          kind: "interviewer_availability",
          title: "Interviewer availability missing",
          description: `Add windows for ${displayName} before slot picker can send`,
          jobId,
          jobTitle: jobTitleById.get(jobId) ?? "Role",
          href: `/recruit/jobs/${jobId}`,
          pipelineStageName: displayName,
          urgency: "due_today",
        });
      }
    }
  }

  return withResolvedPendingHrefs(tasks);
}
