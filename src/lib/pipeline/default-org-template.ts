import type { PipelineStageType } from "@/lib/pipeline/stage-types";

export type OrgDefaultStageRow = {
  stage_name: string;
  stage_order: number;
  stage_type: PipelineStageType;
  sla_days: number | null;
  is_locked: boolean;
  notify_candidate: boolean;
  color: string;
};

/** TigerHire canonical template (matches SQL seed). */
export const TIGERHIRE_DEFAULT_ORG_PIPELINE: OrgDefaultStageRow[] = [
  {
    stage_name: "Applied",
    stage_order: 0,
    stage_type: "system_auto",
    sla_days: 1,
    is_locked: true,
    notify_candidate: false,
    color: "#64748b",
  },
  {
    stage_name: "FitScore Review",
    stage_order: 1,
    stage_type: "system_auto",
    sla_days: 1,
    is_locked: true,
    notify_candidate: false,
    color: "#6366f1",
  },
  {
    stage_name: "Shortlisted",
    stage_order: 2,
    stage_type: "screening",
    sla_days: 3,
    is_locked: false,
    notify_candidate: true,
    color: "#22c55e",
  },
  {
    stage_name: "Recruiter Call",
    stage_order: 3,
    stage_type: "screening",
    sla_days: 3,
    is_locked: false,
    notify_candidate: true,
    color: "#84cc16",
  },
  {
    stage_name: "Interview",
    stage_order: 4,
    stage_type: "interview",
    sla_days: 5,
    is_locked: false,
    notify_candidate: true,
    color: "#3b82f6",
  },
  {
    stage_name: "Final Round",
    stage_order: 5,
    stage_type: "interview",
    sla_days: 5,
    is_locked: false,
    notify_candidate: true,
    color: "#8b5cf6",
  },
  {
    stage_name: "Offer Sent",
    stage_order: 6,
    stage_type: "offer",
    sla_days: 3,
    is_locked: false,
    notify_candidate: true,
    color: "#f59e0b",
  },
  {
    stage_name: "Offer Accepted",
    stage_order: 7,
    stage_type: "offer",
    sla_days: 14,
    is_locked: false,
    notify_candidate: true,
    color: "#10b981",
  },
  {
    stage_name: "Hired",
    stage_order: 8,
    stage_type: "terminal_hired",
    sla_days: null,
    is_locked: true,
    notify_candidate: true,
    color: "#059669",
  },
  {
    stage_name: "Rejected",
    stage_order: 9,
    stage_type: "terminal_reject",
    sla_days: null,
    is_locked: true,
    notify_candidate: false,
    color: "#ef4444",
  },
  {
    stage_name: "Withdrawn",
    stage_order: 10,
    stage_type: "terminal_reject",
    sla_days: null,
    is_locked: true,
    notify_candidate: false,
    color: "#78716c",
  },
];
