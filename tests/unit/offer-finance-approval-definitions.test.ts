import { describe, expect, it } from "vitest";
import {
  DEFAULT_OFFER_FINANCE_APPROVAL_WORKFLOW_KEY,
  OFFER_FINANCE_APPROVAL_WORKFLOW_DEFINITIONS,
  OFFER_FINANCE_APPROVAL_WORKFLOW_KEY_ENUM,
  getOfferFinanceApprovalWorkflowDefinition,
  isValidOfferFinanceApprovalWorkflowKey,
} from "@/lib/workflows/offer-finance-approval-definitions";
import {
  DEFAULT_SETTINGS_PERMISSIONS,
  resolveOfferFinanceApprovalWorkflowDefinitionKey,
} from "@/lib/settings/permissions";

describe("offer finance approval workflow definitions", () => {
  it("enum keys match definition map", () => {
    for (const key of OFFER_FINANCE_APPROVAL_WORKFLOW_KEY_ENUM) {
      expect(OFFER_FINANCE_APPROVAL_WORKFLOW_DEFINITIONS[key]).toBeDefined();
    }
    for (const key of Object.keys(OFFER_FINANCE_APPROVAL_WORKFLOW_DEFINITIONS)) {
      expect(OFFER_FINANCE_APPROVAL_WORKFLOW_KEY_ENUM).toContain(key);
    }
  });

  it("getDefinition falls back for unknown keys", () => {
    const d = getOfferFinanceApprovalWorkflowDefinition("unknown_key");
    expect(d.key).toBe(DEFAULT_OFFER_FINANCE_APPROVAL_WORKFLOW_KEY);
  });

  it("resolveOfferFinanceApprovalWorkflowDefinitionKey validates stored permission", () => {
    expect(
      resolveOfferFinanceApprovalWorkflowDefinitionKey({
        ...DEFAULT_SETTINGS_PERMISSIONS,
        offerFinanceApprovalWorkflowKey: "offer_finance_v1",
      }),
    ).toBe("offer_finance_v1");

    expect(
      resolveOfferFinanceApprovalWorkflowDefinitionKey({
        ...DEFAULT_SETTINGS_PERMISSIONS,
        offerFinanceApprovalWorkflowKey: "bogus",
      }),
    ).toBe(DEFAULT_OFFER_FINANCE_APPROVAL_WORKFLOW_KEY);
  });

  it("isValidOfferFinanceApprovalWorkflowKey", () => {
    expect(isValidOfferFinanceApprovalWorkflowKey("offer_finance_v1")).toBe(true);
    expect(isValidOfferFinanceApprovalWorkflowKey("nope")).toBe(false);
  });
});
