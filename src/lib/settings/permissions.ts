import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/types/database";
import {
  DEFAULT_OFFER_FINANCE_APPROVAL_WORKFLOW_KEY,
  isValidOfferFinanceApprovalWorkflowKey,
} from "@/lib/workflows/offer-finance-approval-definitions";
import {
  DEFAULT_REQUISITION_APPROVAL_WORKFLOW_KEY,
  isValidRequisitionApprovalWorkflowKey,
} from "@/lib/workflows/requisition-approval-definitions";

export type SettingsCapability =
  | "view_settings"
  | "manage_integrations"
  | "manage_privacy"
  | "read_audit"
  | "manage_permissions"
  | "create_offers"
  | "send_offers"
  | "create_assessments"
  | "manage_assessment_templates";

export interface SettingsPermissions {
  recruiterCanManageIntegrations: boolean;
  recruiterCanManagePrivacy: boolean;
  recruiterCanReadAudit: boolean;
  hiringManagerCanViewSettings: boolean;
  hiringManagerCanReadAudit: boolean;
  recruiterCanCreateOffers: boolean;
  hiringManagerCanCreateOffers: boolean;
  /** Who may send an approved offer to the candidate (HR / recruiting ops). */
  recruiterCanSendOffers: boolean;
  hiringManagerCanSendOffers: boolean;
  recruiterCanCreateAssessments: boolean;
  hiringManagerCanCreateAssessments: boolean;
  recruiterCanManageAssessmentTemplates: boolean;
  hiringManagerCanManageAssessmentTemplates: boolean;
  /** B7: profile IDs that receive band-exception approval emails; empty → finance approvers. */
  compApproverProfileIds?: string[];
  /** Optional profile IDs that may approve offer drafts (in addition to job hiring manager + company admin). */
  offerDraftApproverProfileIds?: string[];
  /** When true, skip “candidate must be on an offer pipeline stage” before drafting. */
  offerDraftSkipPipelineStageGate?: boolean;
  /** Substrings matched on lowercased pipeline stage names (see `offer-pipeline-stage-gate.ts`). */
  offerPipelineStageMarkers?: string[];
  /** Predefined admin approval workflow when an offer enters `pending_admin`. */
  offerFinanceApprovalWorkflowKey?: string;
  /** Offer approval is fixed to sequential admin review. */
  offerFinanceApprovalMode?: "always";
  /** Predefined requisition approval chain (manager/hr/finance). */
  requisitionApprovalWorkflowKey?: string;
  /** Progressive disclosure toggle: reveal advanced requisition controls for admins. */
  requisitionAdvancedMode?: boolean;
}

export const DEFAULT_SETTINGS_PERMISSIONS: SettingsPermissions = {
  recruiterCanManageIntegrations: false,
  recruiterCanManagePrivacy: false,
  recruiterCanReadAudit: false,
  hiringManagerCanViewSettings: false,
  hiringManagerCanReadAudit: false,
  recruiterCanCreateOffers: true,
  hiringManagerCanCreateOffers: false,
  recruiterCanSendOffers: true,
  hiringManagerCanSendOffers: false,
  recruiterCanCreateAssessments: true,
  hiringManagerCanCreateAssessments: true,
  recruiterCanManageAssessmentTemplates: true,
  hiringManagerCanManageAssessmentTemplates: true,
  offerFinanceApprovalMode: "always",
  requisitionAdvancedMode: false,
};

/** Resolved workflow definition key for finance rounds (invalid/missing → default). */
export function resolveOfferFinanceApprovalWorkflowDefinitionKey(
  permissions: SettingsPermissions,
): string {
  const k = permissions.offerFinanceApprovalWorkflowKey;
  if (k && isValidOfferFinanceApprovalWorkflowKey(k)) return k;
  return DEFAULT_OFFER_FINANCE_APPROVAL_WORKFLOW_KEY;
}

export function resolveOfferFinanceApprovalMode(permissions: SettingsPermissions): "always" {
  return permissions.offerFinanceApprovalMode === "always" ? "always" : "always";
}

export function resolveRequisitionApprovalWorkflowDefinitionKey(
  permissions: SettingsPermissions,
): string {
  if (!permissions.requisitionAdvancedMode) {
    return DEFAULT_REQUISITION_APPROVAL_WORKFLOW_KEY;
  }
  const k = permissions.requisitionApprovalWorkflowKey;
  if (k && isValidRequisitionApprovalWorkflowKey(k)) return k;
  return DEFAULT_REQUISITION_APPROVAL_WORKFLOW_KEY;
}

export function isRequisitionAdvancedModeEnabled(permissions: SettingsPermissions): boolean {
  return permissions.requisitionAdvancedMode === true;
}

export async function getOrgSettingsPermissions(
  supabase: SupabaseClient,
  organisationId: string,
): Promise<SettingsPermissions> {
  const { data, error } = await supabase
    .from("role_permission_settings")
    .select("permissions")
    .eq("organisation_id", organisationId)
    .maybeSingle();

  if (error) {
    const message = String(error.message ?? "");
    const code = String((error as { code?: string }).code ?? "");
    const isMissingTable =
      code === "42P01" || message.includes('relation "role_permission_settings" does not exist');
    const isMissingColumn =
      code === "42703" ||
      message.includes("column role_permission_settings.permissions does not exist");
    // Backward compatibility: if permissions schema is not migrated yet, keep sensible defaults.
    if (!isMissingTable && !isMissingColumn) throw error;
    return DEFAULT_SETTINGS_PERMISSIONS;
  }

  return {
    ...DEFAULT_SETTINGS_PERMISSIONS,
    ...((data?.permissions as Partial<SettingsPermissions> | undefined) ?? {}),
  };
}

export function hasSettingsCapability(
  role: UserRole,
  capability: SettingsCapability,
  permissions: SettingsPermissions,
): boolean {
  if (role === "super_admin" || role === "leadership") return true;

  if (role === "recruiter") {
    if (capability === "view_settings") return true;
    if (capability === "manage_integrations") return permissions.recruiterCanManageIntegrations;
    if (capability === "manage_privacy") return permissions.recruiterCanManagePrivacy;
    if (capability === "read_audit") return permissions.recruiterCanReadAudit;
    if (capability === "create_offers") return permissions.recruiterCanCreateOffers;
    if (capability === "send_offers") return permissions.recruiterCanSendOffers;
    if (capability === "create_assessments") return permissions.recruiterCanCreateAssessments;
    if (capability === "manage_assessment_templates") {
      return permissions.recruiterCanManageAssessmentTemplates;
    }
    if (capability === "manage_permissions") return false;
  }

  if (role === "hiring_manager") {
    if (capability === "view_settings") return permissions.hiringManagerCanViewSettings;
    if (capability === "read_audit") return permissions.hiringManagerCanReadAudit;
    if (capability === "create_offers") return permissions.hiringManagerCanCreateOffers;
    if (capability === "send_offers") return permissions.hiringManagerCanSendOffers;
    if (capability === "create_assessments") return permissions.hiringManagerCanCreateAssessments;
    if (capability === "manage_assessment_templates") {
      return permissions.hiringManagerCanManageAssessmentTemplates;
    }
    if (capability === "manage_integrations" || capability === "manage_privacy") return false;
    if (capability === "manage_permissions") return false;
  }

  if (role === "interviewer") {
    if (capability === "create_assessments") {
      return (
        permissions.recruiterCanCreateAssessments || permissions.hiringManagerCanCreateAssessments
      );
    }
    if (capability === "manage_assessment_templates") {
      return (
        permissions.recruiterCanManageAssessmentTemplates ||
        permissions.hiringManagerCanManageAssessmentTemplates
      );
    }
    return false;
  }

  return false;
}
