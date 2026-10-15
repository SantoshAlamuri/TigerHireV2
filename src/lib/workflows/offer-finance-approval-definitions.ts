/**
 * Predefined offer finance approval workflows (reusable per organisation via settings).
 * Keys are stored on `workflow_instances.definition_key` and in org role permissions JSON.
 */

export type OfferFinanceApprovalWorkflowStageDef = {
  stageKey: string;
  stageOrder: number;
  approverRole: string;
  slaHours: number;
};

export type OfferFinanceApprovalWorkflowDefinition = {
  key: string;
  label: string;
  description: string;
  stages: OfferFinanceApprovalWorkflowStageDef[];
};

export const DEFAULT_OFFER_FINANCE_APPROVAL_WORKFLOW_KEY = "offer_finance_v1";

export const OFFER_FINANCE_APPROVAL_WORKFLOW_DEFINITIONS: Record<
  string,
  OfferFinanceApprovalWorkflowDefinition
> = {
  offer_finance_v1: {
    key: "offer_finance_v1",
    label: "Admin approval (sequential)",
    description: "Single company admin approval step with an 8 hour SLA clock.",
    stages: [{ stageKey: "admin", stageOrder: 1, approverRole: "leadership", slaHours: 8 }],
  },
};

/** Keys allowed in Zod / API; keep in sync with `OFFER_FINANCE_APPROVAL_WORKFLOW_DEFINITIONS`. */
export const OFFER_FINANCE_APPROVAL_WORKFLOW_KEY_ENUM = ["offer_finance_v1"] as const;

export type OfferFinanceApprovalWorkflowSettingKey =
  (typeof OFFER_FINANCE_APPROVAL_WORKFLOW_KEY_ENUM)[number];

export function isValidOfferFinanceApprovalWorkflowKey(
  key: string,
): key is OfferFinanceApprovalWorkflowSettingKey {
  return (OFFER_FINANCE_APPROVAL_WORKFLOW_KEY_ENUM as readonly string[]).includes(key);
}

export function getOfferFinanceApprovalWorkflowDefinition(
  key: string,
): OfferFinanceApprovalWorkflowDefinition {
  const def = OFFER_FINANCE_APPROVAL_WORKFLOW_DEFINITIONS[key];
  if (def) return def;
  return OFFER_FINANCE_APPROVAL_WORKFLOW_DEFINITIONS[DEFAULT_OFFER_FINANCE_APPROVAL_WORKFLOW_KEY]!;
}

export function listOfferFinanceApprovalWorkflowOptions(): Array<{
  key: string;
  label: string;
  description: string;
}> {
  return Object.values(OFFER_FINANCE_APPROVAL_WORKFLOW_DEFINITIONS).map((d) => ({
    key: d.key,
    label: d.label,
    description: d.description,
  }));
}
