import type { IntegrationConnection } from "@/lib/repositories/integration-connections.repository";

export type IntegrationCategory =
  | "job_board"
  | "hris_payroll"
  | "assessment_interview_bgv"
  | "identity_directory"
  | "platform_api_webhook"
  | "communication"
  | "other";

export type IntegrationMaturity =
  | "registered"
  | "connected"
  | "operational"
  | "compliant"
  | "monitored";
export type IntegrationBucket =
  | "job_board"
  | "ats_hrms"
  | "sso_identity"
  | "interview_stack"
  | "communication"
  | "other";

const CATEGORY_BY_PROVIDER: Record<string, IntegrationCategory> = {
  adzuna: "job_board",
  indeed: "job_board",
  hibob: "hris_payroll",
  bamboohr: "hris_payroll",
  darwinbox: "hris_payroll",
  keka: "hris_payroll",
  workday: "hris_payroll",
  google_sso: "identity_directory",
  microsoft_sso: "identity_directory",
  okta_sso: "identity_directory",
  google_calendar: "assessment_interview_bgv",
  outlook: "assessment_interview_bgv",
  teams: "assessment_interview_bgv",
  zoom: "assessment_interview_bgv",
  daily: "assessment_interview_bgv",
  assemblyai: "assessment_interview_bgv",
  deepgram: "assessment_interview_bgv",
  springverify: "assessment_interview_bgv",
  sendgrid: "communication",
  resend: "communication",
};

function deriveMaturity(connection: IntegrationConnection): IntegrationMaturity {
  if (connection.status === "error") return "registered";
  if (connection.status === "disconnected") return "registered";
  if (connection.status === "connected" && connection.secret_ref) return "connected";
  if (connection.status === "connected") return "operational";
  return "registered";
}

function deriveComplianceFlags(connection: IntegrationConnection) {
  return {
    hasSecretRef: Boolean(connection.secret_ref),
    hasAuditTrace: Boolean(connection.updated_at),
    hasStatusMessage: Boolean(connection.status_message),
  };
}

function bucketForCategory(category: IntegrationCategory): IntegrationBucket {
  if (category === "job_board") return "job_board";
  if (category === "hris_payroll") return "ats_hrms";
  if (category === "identity_directory") return "sso_identity";
  if (category === "assessment_interview_bgv") return "interview_stack";
  if (category === "communication") return "communication";
  return "other";
}

export function normalizeIntegrationConnection(connection: IntegrationConnection) {
  const category = CATEGORY_BY_PROVIDER[connection.provider] ?? "other";
  const bucket = bucketForCategory(category);
  const maturity = deriveMaturity(connection);
  const compliance = deriveComplianceFlags(connection);
  const health =
    connection.status === "error"
      ? "degraded"
      : connection.status === "connected"
        ? "healthy"
        : "idle";

  return {
    ...connection,
    category,
    bucket,
    maturity,
    lifecycle: {
      stage: maturity,
      health,
      lastUpdatedAt: connection.updated_at,
    },
    compliance,
  };
}
