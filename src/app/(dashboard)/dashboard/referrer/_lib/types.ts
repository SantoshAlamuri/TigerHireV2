export type TabKey = "overview" | "network" | "links" | "candidates" | "leaderboard";

export type CandidateApplicationRow = {
  id: string;
  status: string;
  created_at: string;
  job_title: string;
  company_name: string;
  fit_score: number | null;
};

export type PayoutRow = {
  id: string;
  candidate_name: string;
  job_title: string;
  trigger_event: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  pipeline_stage: string;
  applied_at: string | null;
};

export type EmployeeWhatsappReferralRow = {
  id: string;
  candidate_name: string;
  candidate_phone: string;
  status: string;
  created_at: string;
  referral_bonus_eligible: boolean;
  referral_bonus_paid_at: string | null;
  job_title: string | null;
};

export type ReferProfilePayload = {
  referrer: {
    id: string;
    name: string;
    type: string;
    city: string | null;
    whatsapp_number: string | null;
    work_email: string | null;
    linkedin_url: string | null;
    verified_org_id: string | null;
    verified_org_name: string | null;
    org_verified: boolean;
  };
  candidate_applications: CandidateApplicationRow[];
  earnings: { pending_inr: number; paid_inr: number };
  payouts: PayoutRow[];
  links: {
    link_id: string;
    job_id: string;
    job_title: string;
    /** From `jobs.status`; not `open` means the role is no longer accepting applications via this link. */
    job_status: string;
    company_name: string;
    token: string;
    apply_url: string;
    /** ISO; null = legacy link with no expiry recorded. */
    expires_at: string | null;
    direct_bonus_amount: number;
    parent_bonus_amount: number;
    bonus_currency: string;
    applied_count: number;
  }[];
  leaderboard: {
    rank: number;
    referrer_id: string;
    name: string;
    city: string;
    total_paid: number;
    is_current: boolean;
  }[];
  pool: { total_paid_inr: number };
  /** Present for employees; invite rows from the legacy team referral form. */
  employee_whatsapp_referrals?: EmployeeWhatsappReferralRow[];
};

export type ReferProfileNeedsSetup = {
  needs_setup: true;
};

export type OpenJobRow = {
  id: string;
  title: string;
  organisation_name: string;
  organisation_slug: string;
  location: string | null;
  direct_bonus_amount: number;
  parent_bonus_amount: number;
};

export type OtpSendResponse = {
  sent?: boolean;
  error?: string;
  debug_delivery_failed?: boolean;
  debug_code?: string;
  debug_error?: string;
};

export type LoadDashboardResult =
  | { needsSetup: true }
  | { needsSetup: false; data: ReferProfilePayload }
  | null;

export type LinkActionMessage = { tone: "info" | "error"; text: string };
