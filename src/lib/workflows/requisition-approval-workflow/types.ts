export type WorkflowStageRow = {
  id: string;
  stage_key: string;
  stage_order: number;
  approver_role: string | null;
  status: string;
};

export type StagePlanRow = {
  stageKey: string;
  stageOrder: number;
  approverRole: string;
  slaHours: number;
};

export type WorkflowInstanceRow = {
  id: string;
  organisation_id: string;
  definition_key: string;
  status: string;
};

export const OPEN_REQUISITION_STAGE_STATUSES = new Set(["pending", "active", "escalated"]);
export const ACTIONABLE_REQUISITION_STAGE_STATUSES = new Set(["active", "escalated"]);

export const PENDING_REQUISITION_STATUSES = new Set(["submitted", "under_review", "pending"]);

export const OPEN_STAGE_STATUSES = OPEN_REQUISITION_STAGE_STATUSES;
export const ACTIONABLE_STAGE_STATUSES = ACTIONABLE_REQUISITION_STAGE_STATUSES;

export const TERMINAL_STAGE_STATUSES = new Set(["approved", "rejected"]);

export type RequisitionDecisionSuccess = {
  ok: true;
  instanceId: string;
  stageId: string;
  workflowStatus: "active" | "completed" | "rejected";
  nextActiveRoles: string[];
};

export type RequisitionWorkflowSnapshot = {
  instanceStatus: string | null;
  awaitingRoles: string[];
  issue: string | null;
  /** Unified tasks inbox id, e.g. requisition:{stageId} — for /tasks deep links. */
  pendingTaskId: string | null;
};
