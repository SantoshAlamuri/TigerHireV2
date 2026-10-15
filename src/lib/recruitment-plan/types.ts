export const RECRUITMENT_PLAN_STATUSES = [
  "draft",
  "active",
  "paused",
  "completed",
  "archived",
] as const;

export type RecruitmentPlanStatus = (typeof RECRUITMENT_PLAN_STATUSES)[number];

export const PLAN_STAGE_TYPES = [
  "application_review",
  "phone_screen",
  "interview",
  "assessment",
  "approval",
  "offer",
  "custom",
] as const;

export type PlanStageType = (typeof PLAN_STAGE_TYPES)[number];

export const PLAN_STAGE_FORMATS = ["video", "phone", "in_person", "async"] as const;
export type PlanStageFormat = (typeof PLAN_STAGE_FORMATS)[number];

export const PLAN_APPROVAL_GATES = [
  "none",
  "recruiter",
  "hm",
  "recruiter_and_hm",
  "finance_recruiter_hm",
] as const;

export type PlanApprovalGate = (typeof PLAN_APPROVAL_GATES)[number];

export const PLAN_HISTORY_ACTOR_TYPES = ["human", "system", "agent"] as const;
export type PlanHistoryActorType = (typeof PLAN_HISTORY_ACTOR_TYPES)[number];

export interface RecruitmentPlanRow {
  id: string;
  organisation_id: string;
  job_id: string;
  status: RecruitmentPlanStatus;
  target_days_to_fill: number | null;
  created_at: string;
  activated_at: string | null;
  created_by: string;
  updated_at: string;
}

export interface PlanStageRow {
  id: string;
  plan_id: string;
  /** Stable link to pipeline_stages.id when seeded or backfilled. */
  pipeline_stage_id: string | null;
  stage_order: number;
  stage_type: PlanStageType;
  display_name: string;
  primary_interviewer_id: string | null;
  backup_interviewer_id: string | null;
  duration_minutes: number | null;
  format: PlanStageFormat | null;
  scorecard_template_id: string | null;
  comms_template_id: string | null;
  /** WhatsApp template name or email template id (Brief 11 Phase C). */
  comms_template: string | null;
  approval_gate: PlanApprovalGate;
  target_dwell_days: number;
  is_active: boolean;
  created_at: string;
}

export interface PlanHistoryRow {
  id: string;
  plan_id: string;
  candidate_id: string | null;
  actor_type: PlanHistoryActorType;
  actor_user_id: string | null;
  event_type: string;
  event_summary: string;
  details: Record<string, unknown> | null;
  created_at: string;
}
