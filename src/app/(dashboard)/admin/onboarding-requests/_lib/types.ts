import type { Dispatch, SetStateAction } from "react";
import { ENTITLEMENT_FEATURE_KEYS } from "@/lib/entitlements/config";

export type OnboardingStatus = "pending" | "approved" | "handled" | "cancelled";

export type OnboardingPlan = "starter" | "pro" | "enterprise";

export type AdminPayload = {
  legalCompanyName: string;
  billingSpocName: string;
  billingSpocEmail: string;
  billingSpocPhone: string;
  billingAddress: string;
  gstin: string;
  website: string;
  notes: string;
  workflow: {
    companyInfoSaved: boolean;
    billingProfileSaved: boolean;
    creditsConfigured: boolean;
    overridesReviewed: boolean;
  };
};

export interface OnboardingRequestRow {
  id: string;
  name: string | null;
  email: string;
  company: string | null;
  message: string;
  created_at: string;
  onboarding_domain: string | null;
  onboarding_role_title: string | null;
  onboarding_status: OnboardingStatus;
  onboarding_company_id: string | null;
  onboarding_admin_payload: AdminPayload | null;
  onboarding_approved_at: string | null;
  onboarding_approved_by: string | null;
  onboarding_handled_at: string | null;
  onboarding_handled_by: string | null;
  onboarding_handled_notes: string | null;
}

export interface BillingDetailsResponse {
  profile: {
    billing_mode: "automated" | "manual";
    customer_type: string;
    unlock_credits_monthly: number;
    job_credits_monthly: number;
    allow_negative_balance: boolean;
    notes: string | null;
  };
  wallet: {
    unlock_balance: number;
    job_balance: number;
  };
}

export interface FeaturesResponse {
  features: Array<{
    key: (typeof ENTITLEMENT_FEATURE_KEYS)[number];
    label: string;
    planDefault: boolean;
    override: boolean | null;
    effective: boolean;
  }>;
}

export interface ApprovalForm {
  company_name: string;
  primary_domain: string;
  plan: OnboardingPlan;
  admin_email: string;
  admin_first_name: string;
  admin_last_name: string;
}

export interface BillingDraft {
  billingMode: "automated" | "manual";
  customerType: string;
  unlockCreditsMonthly: number;
  jobCreditsMonthly: number;
  allowNegativeBalance: boolean;
  notes: string;
}

export interface CreditDraft {
  unlockDelta: number;
  jobDelta: number;
  reason: string;
}

export interface AutopilotConfig {
  autoCompleteRequest: boolean;
  seedCreditsFromMonthlyPolicy: boolean;
  applyRecommendedOverrides: boolean;
}

export interface RequestsData {
  requests: OnboardingRequestRow[];
}

/** Structural mirror of useApiQuery's return so action ctx stays framework-agnostic. */
export interface ApiQuery<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: (opts?: { silent?: boolean }) => Promise<void>;
  mergeData: (updater: (prev: T | null) => T) => void;
}

export type ToastFn = (input: {
  title: string;
  description?: string;
  tone?: "success" | "danger" | "error" | "info" | "warning";
  duration?: number;
  action?: { label: string; onClick: () => void };
}) => string;

export interface PatchRequestParams {
  row: OnboardingRequestRow;
  onboardingStatus: OnboardingStatus;
  onboardingCompanyId?: string | null;
  payload?: AdminPayload | null;
  handledNotes?: string;
}

/**
 * Shared dependency bag threaded into every workflow action. The hook builds this
 * fresh each render, so action bodies read the same values the original closures did.
 */
export interface WorkflowCtx {
  activeRequest: OnboardingRequestRow | null;
  companyId: string | null;
  approvalForm: ApprovalForm;
  adminPayload: AdminPayload;
  completionNotes: string;
  billingDraft: BillingDraft;
  creditDraft: CreditDraft;
  autopilotConfig: AutopilotConfig;
  setSaving: Dispatch<SetStateAction<boolean>>;
  setActionError: Dispatch<SetStateAction<string>>;
  setCompanyInfoValidationError: Dispatch<SetStateAction<string>>;
  setAutopilotLoading: Dispatch<SetStateAction<boolean>>;
  setAutopilotLog: Dispatch<SetStateAction<string[]>>;
  setCreditDraft: Dispatch<SetStateAction<CreditDraft>>;
  toast: ToastFn;
  refetch: (opts?: { silent?: boolean }) => Promise<void>;
  mergeData: (updater: (prev: RequestsData | null) => RequestsData) => void;
  billingQuery: ApiQuery<BillingDetailsResponse>;
  featuresQuery: ApiQuery<FeaturesResponse>;
  patchRequest: (params: PatchRequestParams) => Promise<OnboardingRequestRow | undefined>;
  applyCredit: (type: "unlock" | "job", delta: number, reason: string) => Promise<void>;
  setFeatureOverride: (featureKey: string, enabled: boolean) => Promise<void>;
}
