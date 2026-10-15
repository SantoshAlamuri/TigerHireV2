export type RequisitionApprovalStageDef = {
  stageKey: string;
  stageOrder: number;
  approverRole: string;
  slaHours: number;
};

export type RequisitionApprovalWorkflowDefinition = {
  key: string;
  label: string;
  description: string;
  stages: RequisitionApprovalStageDef[];
};

export const DEFAULT_REQUISITION_APPROVAL_WORKFLOW_KEY = "requisition_linear_v1";

export const REQUISITION_APPROVAL_WORKFLOW_DEFINITIONS: Record<
  string,
  RequisitionApprovalWorkflowDefinition
> = {
  requisition_linear_v1: {
    key: "requisition_linear_v1",
    label: "Finance -> Admin (8h SLA each)",
    description: "Finance approval followed by admin sign-off.",
    stages: [
      { stageKey: "finance", stageOrder: 1, approverRole: "finance", slaHours: 8 },
      { stageKey: "admin", stageOrder: 2, approverRole: "leadership", slaHours: 8 },
    ],
  },
  requisition_parallel_hr_finance_v1: {
    key: "requisition_parallel_hr_finance_v1",
    label: "(Finance + Admin parallel)",
    description: "Finance and admin approve in parallel with independent SLA clocks.",
    stages: [
      { stageKey: "finance", stageOrder: 1, approverRole: "finance", slaHours: 8 },
      { stageKey: "admin", stageOrder: 1, approverRole: "leadership", slaHours: 8 },
    ],
  },
};

export const REQUISITION_APPROVAL_WORKFLOW_KEY_ENUM = [
  "requisition_linear_v1",
  "requisition_parallel_hr_finance_v1",
] as const;

export type RequisitionApprovalWorkflowSettingKey =
  (typeof REQUISITION_APPROVAL_WORKFLOW_KEY_ENUM)[number];

export function isValidRequisitionApprovalWorkflowKey(
  key: string,
): key is RequisitionApprovalWorkflowSettingKey {
  return (REQUISITION_APPROVAL_WORKFLOW_KEY_ENUM as readonly string[]).includes(key);
}

export function getRequisitionApprovalWorkflowDefinition(
  key: string,
): RequisitionApprovalWorkflowDefinition {
  const def = REQUISITION_APPROVAL_WORKFLOW_DEFINITIONS[key];
  if (def) return def;
  return REQUISITION_APPROVAL_WORKFLOW_DEFINITIONS[DEFAULT_REQUISITION_APPROVAL_WORKFLOW_KEY]!;
}

export function listRequisitionApprovalWorkflowOptions(): Array<{
  key: string;
  label: string;
  description: string;
}> {
  return Object.values(REQUISITION_APPROVAL_WORKFLOW_DEFINITIONS).map((d) => ({
    key: d.key,
    label: d.label,
    description: d.description,
  }));
}
