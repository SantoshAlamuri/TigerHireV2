import { describe, expect, it } from "vitest";
import {
  disconnectIntegrationSchema,
  permissionsSettingsSchema,
  privacySettingsSchema,
  saveApiKeySchema,
} from "@/lib/validations/integrations";

/** The core booleans the permissions panel always sends. */
const BASE_PERMISSIONS = {
  recruiterCanManageIntegrations: false,
  recruiterCanManagePrivacy: false,
  recruiterCanReadAudit: false,
  hiringManagerCanViewSettings: false,
  hiringManagerCanReadAudit: false,
  recruiterCanCreateOffers: true,
  hiringManagerCanCreateOffers: false,
  recruiterCanCreateAssessments: true,
  hiringManagerCanCreateAssessments: true,
  recruiterCanManageAssessmentTemplates: true,
  hiringManagerCanManageAssessmentTemplates: true,
};

describe("integrations validation", () => {
  it("accepts valid api key payload", () => {
    const result = saveApiKeySchema.safeParse({
      provider: "sendgrid",
      apiKey: "SG.1234567890",
      config: { mode: "prod" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects short api key", () => {
    const result = saveApiKeySchema.safeParse({
      provider: "sendgrid",
      apiKey: "short",
    });
    expect(result.success).toBe(false);
  });

  it("accepts disconnect payload", () => {
    const result = disconnectIntegrationSchema.safeParse({ provider: "zoom" });
    expect(result.success).toBe(true);
  });

  it("accepts newly added HRIS providers", () => {
    const bamboo = saveApiKeySchema.safeParse({
      provider: "bamboohr",
      apiKey: "bamboo_key_12345",
      config: { companyDomain: "acme" },
    });
    const workday = saveApiKeySchema.safeParse({
      provider: "workday",
      apiKey: "workday_secret_12345",
      config: { tokenUrl: "https://example.workday.com/oauth2/token", clientId: "client-id" },
    });

    expect(bamboo.success).toBe(true);
    expect(workday.success).toBe(true);
  });

  it("rejects privacy payload outside limits", () => {
    const result = privacySettingsSchema.safeParse({
      consentMessage: "short",
      recordingRetentionDays: 1,
      transcriptRetentionDays: 10,
    });
    expect(result.success).toBe(false);
  });

  describe("permissionsSettingsSchema (Bug Report: Org #17)", () => {
    it("accepts the full settings object the GET endpoint returns + client echoes back", () => {
      // These keys (owned by other settings routes) previously tripped .strict():
      // "Unrecognized keys: offerLetterFlow, recruiterCanSendOffers,
      //  offerFinanceApprovalMode, hiringManagerCanSendOffers".
      const result = permissionsSettingsSchema.safeParse({
        ...BASE_PERMISSIONS,
        recruiterCanSendOffers: true,
        hiringManagerCanSendOffers: false,
        offerFinanceApprovalMode: "always",
        offerLetterFlow: { steps: [], ctcCalculators: [] },
        requisitionAdvancedMode: false,
      });
      expect(result.success).toBe(true);
    });

    it("accepts the documented optional approver/marker fields", () => {
      const result = permissionsSettingsSchema.safeParse({
        ...BASE_PERMISSIONS,
        compApproverProfileIds: ["p1", "p2"],
        offerDraftApproverProfileIds: ["p3"],
        offerDraftSkipPipelineStageGate: true,
        offerPipelineStageMarkers: ["offer"],
      });
      expect(result.success).toBe(true);
    });

    it("still rejects a genuinely unknown key (strictness preserved)", () => {
      const result = permissionsSettingsSchema.safeParse({
        ...BASE_PERMISSIONS,
        totallyBogusKey: true,
      });
      expect(result.success).toBe(false);
    });

    it("still rejects an invalid offerFinanceApprovalMode literal", () => {
      const result = permissionsSettingsSchema.safeParse({
        ...BASE_PERMISSIONS,
        offerFinanceApprovalMode: "sometimes",
      });
      expect(result.success).toBe(false);
    });
  });
});
