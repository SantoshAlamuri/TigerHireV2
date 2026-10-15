import { z } from "zod";
import { OFFER_FINANCE_APPROVAL_WORKFLOW_KEY_ENUM } from "@/lib/workflows/offer-finance-approval-definitions";
import { REQUISITION_APPROVAL_WORKFLOW_KEY_ENUM } from "@/lib/workflows/requisition-approval-definitions";

export const providerEnum = z.enum([
  "google_calendar",
  "outlook",
  "zoom",
  "teams",
  "daily",
  "assemblyai",
  "deepgram",
  "sendgrid",
  "resend",
  "adzuna",
  "indeed",
  "idibu",
  "springverify",
  "hibob",
  "bamboohr",
  "darwinbox",
  "keka",
  "workday",
  "google_sso",
  "microsoft_sso",
  "okta_sso",
]);

export const saveApiKeySchema = z
  .object({
    provider: providerEnum,
    apiKey: z.string().min(8, "Key too short").max(512),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const saveOAuthConfigSchema = z
  .object({
    provider: providerEnum,
    config: z
      .object({
        defaultCalendarId: z.string().optional(),
        features: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const disconnectIntegrationSchema = z
  .object({
    provider: providerEnum,
  })
  .strict();

export const privacySettingsSchema = z
  .object({
    consentMessage: z.string().min(20).max(1000),
    recordingRetentionDays: z.number().int().min(7).max(730),
    transcriptRetentionDays: z.number().int().min(30).max(1825),
  })
  .strict();

export const permissionsSettingsSchema = z
  .object({
    recruiterCanManageIntegrations: z.boolean(),
    recruiterCanManagePrivacy: z.boolean(),
    recruiterCanReadAudit: z.boolean(),
    hiringManagerCanViewSettings: z.boolean(),
    hiringManagerCanReadAudit: z.boolean(),
    recruiterCanCreateOffers: z.boolean(),
    hiringManagerCanCreateOffers: z.boolean(),
    /** Who may send an approved offer to the candidate. */
    recruiterCanSendOffers: z.boolean().optional(),
    hiringManagerCanSendOffers: z.boolean().optional(),
    recruiterCanCreateAssessments: z.boolean(),
    hiringManagerCanCreateAssessments: z.boolean(),
    recruiterCanManageAssessmentTemplates: z.boolean(),
    hiringManagerCanManageAssessmentTemplates: z.boolean(),
    /** Band-exception approver profile IDs (empty → finance approvers). */
    compApproverProfileIds: z.array(z.string()).optional(),
    /** Extra profile IDs allowed to approve offer drafts. */
    offerDraftApproverProfileIds: z.array(z.string()).optional(),
    /** Skip the "candidate must be on an offer pipeline stage" gate. */
    offerDraftSkipPipelineStageGate: z.boolean().optional(),
    /** Lowercased pipeline-stage-name substrings treated as offer stages. */
    offerPipelineStageMarkers: z.array(z.string()).optional(),
    /** Offer approval is fixed to sequential admin review. */
    offerFinanceApprovalMode: z.literal("always").optional(),
    /** Predefined offer finance SLA template (org-wide). */
    offerFinanceApprovalWorkflowKey: z.enum(OFFER_FINANCE_APPROVAL_WORKFLOW_KEY_ENUM).optional(),
    /** Predefined requisition approval chain template (org-wide). */
    requisitionApprovalWorkflowKey: z.enum(REQUISITION_APPROVAL_WORKFLOW_KEY_ENUM).optional(),
    /** Progressive disclosure for requisition admin controls. */
    requisitionAdvancedMode: z.boolean().optional(),
    /**
     * Offer-letter flow config — owned and validated by
     * /api/settings/offer-letter-flow. Accepted opaquely here so the
     * permissions panel can echo the full settings object back without the
     * strict schema rejecting it (it is merged, not overwritten, on save).
     */
    offerLetterFlow: z.unknown().optional(),
  })
  .strict();

export type Provider = z.infer<typeof providerEnum>;
export type SaveApiKeyInput = z.infer<typeof saveApiKeySchema>;
export type PrivacySettingsInput = z.infer<typeof privacySettingsSchema>;
export type PermissionsSettingsInput = z.infer<typeof permissionsSettingsSchema>;
