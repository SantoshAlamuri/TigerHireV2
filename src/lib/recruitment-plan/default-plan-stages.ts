import type { PlanStageType } from "./types";

export interface DefaultPlanStageInput {
  stage_order: number;
  stage_type: PlanStageType;
  display_name: string;
  target_dwell_days: number;
  duration_minutes?: number;
  format?: "video" | "phone" | "in_person" | "async";
  approval_gate?: "none" | "recruiter" | "hm" | "recruiter_and_hm" | "finance_recruiter_hm";
}

/** Built-in default plan (Brief 11 Q2). Recruiter customizes per job. */
export const DEFAULT_PLAN_STAGES: DefaultPlanStageInput[] = [
  {
    stage_order: 0,
    stage_type: "application_review",
    display_name: "Application",
    target_dwell_days: 3,
  },
  {
    stage_order: 1,
    stage_type: "phone_screen",
    display_name: "Phone screen",
    target_dwell_days: 5,
    duration_minutes: 30,
    format: "phone",
  },
  {
    stage_order: 2,
    stage_type: "interview",
    display_name: "Technical",
    target_dwell_days: 5,
    duration_minutes: 60,
    format: "video",
  },
  {
    stage_order: 3,
    stage_type: "interview",
    display_name: "HM round",
    target_dwell_days: 5,
    duration_minutes: 45,
    format: "video",
    approval_gate: "recruiter_and_hm",
  },
  {
    stage_order: 4,
    stage_type: "offer",
    display_name: "Offer",
    target_dwell_days: 7,
    approval_gate: "finance_recruiter_hm",
  },
];
