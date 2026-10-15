export interface AnalyticsData {
  totals: {
    candidates: number;
    companies: number;
    activeJobs: number;
    fitScores: number;
    users: number;
    agentRuns: number;
  };
  roleCounts?: Record<string, number>;
}

export type OnboardingRequest = {
  id: string;
  name: string | null;
  company: string | null;
  created_at: string;
  onboarding_status: "pending" | "approved" | "handled" | "cancelled" | null;
  onboarding_company_id: string | null;
  onboarding_admin_payload: Record<string, unknown> | null;
  onboarding_approved_by?: string | null;
  onboarding_handled_by?: string | null;
};

export type OnboardingRequestsResponse = {
  requests: OnboardingRequest[];
};

export type BillingOrganisationRow = {
  id: string;
  name: string;
  subscription_status: string | null;
  billing_mode: string;
  unlock_balance: number;
  job_balance: number;
  created_at?: string;
};

export type BillingDataResponse = {
  organisations: BillingOrganisationRow[];
};

export type WhatsAppSessionRow = {
  id: string;
  phone: string;
  session_state: string;
  context: Record<string, unknown>;
  last_message_at: string;
  last_candidate_message_at?: string | null;
};

export type WhatsAppSessionsResponse = {
  sessions: WhatsAppSessionRow[];
};

export type AgentLog = {
  id: string;
  agent_name?: string;
  status?: string;
  created_at?: string;
};

export type AgentsResponse = {
  logs: AgentLog[];
};

export type FitScoreObservabilityResponse = {
  metrics: {
    cacheHitRatePct: number;
    batchConcurrencyHighWaterMark: number;
    batchConcurrencyConfiguredLimit: number;
    evidenceQuoteValidationPassRatePct: number;
  };
};

export type UsageSummaryResponse = {
  organisationId: string;
  jobsCount: number;
  candidatesProcessed: number;
  fitScoresComputed: number;
  generatedAt: string;
};

export type WhatsAppFlowStatusResponse = {
  jobId: string;
  candidateId: string;
  whatsappOptIn: boolean;
  timeline: Array<{
    type: string;
    status: "pending" | "completed";
    label: string;
    at: string | null;
  }>;
};
