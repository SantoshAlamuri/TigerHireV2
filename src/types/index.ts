import type { UserRole as DatabaseUserRole } from "./database";
import { scoreToTone, scoreToneBgClass, scoreToneTextClass } from "@/lib/score-tone";

export * from "./resume";
export {
  SUPABASE_TABLES,
  SUPABASE_VIEWS,
  SUPABASE_STORAGE_BUCKETS,
  type SupabaseTableName,
  type SupabaseViewName,
  type SupabaseStorageBucketId,
} from "./supabase-tables";

export type WaitlistType = "company" | "candidate";

/** User role; sourced from src/types/database.ts (USER_ROLES). */
export type UserRole = DatabaseUserRole;

export type ProcessingStatus = "pending" | "processing" | "complete" | "failed";

export type EmploymentStatus = "external" | "active_employee" | "resigned" | "alumni";

export type ConsentType =
  | "cv_processing"
  | "profile_storage"
  | "recruiter_visibility"
  | "whatsapp_communication"
  | "salary_data"
  | "marketing";

export interface ConsentRecord {
  id: string;
  phone: string;
  candidateId: string | null;
  consentType: ConsentType;
  consentGiven: boolean;
  consentText: string;
  obtainedVia: "whatsapp_message" | "web_form" | "invite_email";
  whatsappMessageId: string | null;
  createdAt: string;
}

export interface ErasureRequest {
  id: string;
  candidateId: string | null;
  phone: string | null;
  requestedVia: "whatsapp" | "email" | "web";
  status: "pending" | "in_progress" | "completed" | "rejected";
  rejectionReason: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface EmployeeInvite {
  id: string;
  companyId: string;
  email: string;
  fullName: string | null;
  inviteToken: string;
  invitedBy: string | null;
  acceptedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export type EmployeeReferralStatus =
  | "invited"
  | "cv_received"
  | "scored"
  | "shortlisted"
  | "interviewed"
  | "hired"
  | "rejected";

export interface EmployeeReferral {
  id: string;
  referrerId: string;
  referrerCompanyId: string;
  candidateId: string | null;
  jobId: string;
  candidatePhone: string;
  candidateName: string;
  status: EmployeeReferralStatus;
  referralBonusEligible: boolean;
  referralBonusPaidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResignationEvent {
  id: string;
  candidateId: string;
  declaredBy: "self" | "admin";
  declaredByUserId: string | null;
  disputed: boolean;
  disputedBy: string | null;
  disputedAt: string | null;
  disputeReason: string | null;
  profileUnlockScheduledAt: string | null;
  profileUnlockedAt: string | null;
  createdAt: string;
}

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar?: string;
  organisationId?: string;
  organisationName?: string;
  createdAt: string;
  /** Org Setup + org-wide settings (Brief 1). */
  isOrgAdmin?: boolean;
}

export type RoleFunction =
  | "Engineering"
  | "Product"
  | "Design"
  | "Sales"
  | "HR"
  | "Finance"
  | "Operations"
  | "Marketing";

export type SeniorityLevel =
  | "Intern"
  | "Junior"
  | "Mid"
  | "Senior"
  | "Lead"
  | "Manager"
  | "Director"
  | "VP"
  | "C-Suite";

export type IntentLabel =
  | "Active Now"
  | "Actively Exploring"
  | "Passively Open"
  | "Lightly Passive"
  | "Unknown";

export type CandidateScreeningFlag = "not_started" | "in_progress" | "completed" | "attention";

export interface Candidate {
  id: string;
  name: string;
  nameMasked: string;
  claimed: boolean;
  roleTitle: string;
  roleFunction: RoleFunction;
  seniorityLevel: SeniorityLevel;
  currentCompany: string;
  locationCity: string;
  locationState: string;
  remotePreference: "onsite" | "hybrid" | "remote";
  skillsVerified: string[];
  skillsInferred: string[];
  intentScore: number;
  intentLabel: IntentLabel;
  signalFreshnessDate: string;
  salaryMinInferred: number;
  salaryMaxInferred: number;
  yearsExperience: number;
  profileCompleteness: number;
  signalSources: string[];
  linkedinUrl?: string;
  portfolioUrl?: string;
  githubUrl?: string;
  avatarUrl?: string;
  screeningFlag?: CandidateScreeningFlag;
  screeningStatus?: string;
  screeningMode?: string;
  screeningUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateSignal {
  id: string;
  candidateId: string;
  sourcePlatform: string;
  rawText: string;
  signalType: string;
  signalDate: string;
  processed: boolean;
  agentRunId: string;
}

export type FundingStage =
  | "Bootstrapped"
  | "Pre-Seed"
  | "Seed"
  | "Series A"
  | "Series B"
  | "Series C+"
  | "Public"
  | "Unknown";

export type CompanySizeBand =
  | "1-10"
  | "11-50"
  | "51-200"
  | "201-500"
  | "501-1000"
  | "1001-5000"
  | "5000+";

export interface Company {
  id: string;
  name: string;
  industry: string;
  sizeBand: CompanySizeBand;
  fundingStage: FundingStage;
  locations: string[];
  techStack: string[];
  hiringUrgencyScore: number;
  logoUrl?: string;
  website?: string;
  activeRolesCount: number;
  createdAt: string;
}

export interface JdSectionsView {
  designation?: string;
  reportingTo?: string;
  aboutCompany?: string;
  rolesAndResponsibilities?: string[];
  technicalSkills?: string[];
  leadershipSkills?: string[];
  softSkills?: string[];
  preferredSkills?: string[];
  niceToHave?: string[];
  benefits?: string[];
  educationRequirements?: string;
  employmentType?: string;
  experienceRange?: string;
  noticePeriod?: string;
}

export type { JdSection, DynamicJdSections } from "@/components/dashboard/JDWizard/types";

export interface JobPosting {
  id: string;
  companyId: string;
  companyName: string;
  titleRaw: string;
  titleNormalised: string;
  roleFunction: RoleFunction;
  seniorityLevel: SeniorityLevel;
  location: string;
  remoteAllowed: boolean;
  skillsRequired: string[];
  skillsPreferred: string[];
  salaryMin: number;
  salaryMax: number;
  jdTextRaw: string;
  jdSections?: JdSectionsView;
  /** Legacy numeric urgency signal; may be null when no internal score exists. */
  urgencyScore: number | null;
  /** Internal priority from linked hiring request; recruiter/company surfaces only. */
  internalPriority?: "low" | "normal" | "high" | "urgent" | "critical";
  sourceUrl?: string;
  postedDate: string;
  lastSeenDate: string;
  isActive: boolean;
  matchedCandidatesCount: number;
  /** From `job_referral_config` when direct_bonus_amount &gt; 0 */
  referralDirectBonusAmount?: number;
  referralBonusCurrency?: string;
}

export type FitScoreRating =
  | "Strong Match"
  | "Good Match"
  | "Moderate"
  | "Weak"
  | "Poor"
  | "Strong Fit"
  | "Good Fit"
  | "Moderate Fit"
  | "Weak Fit"
  | "Not a Fit";

export interface FitScoreDimension {
  label: string;
  score: number;
  weight: number;
  /** AI rationale for this dimension (why this score). */
  reasoning?: string;
}

/** Three-stage criteria breakdown item (from criteria_breakdown jsonb). */
export interface FitScoreCriteriaBreakdownItem {
  criterion_id: string;
  criterion_name: string;
  weight: number;
  grade: string;
  points_earned: number;
  evidence_text: string;
  evidence_rule_matched?: string;
}

export interface FitScoreEvidenceQuote {
  dimension: string;
  quote: string;
  location_hint?: string;
}

export interface FitScore {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateNameMasked: string;
  jobPostingId: string;
  jobTitle: string;
  companyName: string;
  overallScore: number;
  rating: FitScoreRating;
  /** v1/v2: legacy dimensions. Three-stage: use criteriaBreakdown instead. */
  dimensions: Record<string, FitScoreDimension>;
  /** Three-stage: criterion-level breakdown (grade, points, evidence). */
  criteriaBreakdown?: FitScoreCriteriaBreakdownItem[];
  /** Three-stage: band label (Strong Fit, Good Fit, etc.). */
  band?: string;
  greenFlags: string[];
  amberFlags: string[];
  redFlags: string[];
  aiSummary: string;
  aiRecommendation?: string;
  /** Three-stage: key strengths and gaps. */
  keyStrengths?: string[];
  keyGaps?: string[];
  oneLineSummary?: string;
  blendReasoning?: string;
  /** Three-stage: human-readable formula e.g. "Criterion(A): 100 x 30/100 = 30 + ... = 72". */
  scoringFormula?: string;
  /** Three-stage: SHA256 provenance hash for audit. */
  provenanceHash?: string;
  scoringStatus?: "scored" | "deferred" | "failed";
  scoringStatusReason?: string | null;
  scoringStatusUpdatedAt?: string;
  signalScore?: number | null;
  gradeBasedScore?: number | null;
  matchedKeywords?: string[];
  rubricSnapshot?: Record<string, unknown> | null;
  evidenceSnapshot?: Record<string, unknown> | null;
  verdictEvidenceQuotes?: FitScoreEvidenceQuote[] | null;
  extractionModel?: string | null;
  extractionFallback?: boolean | null;
  /** v2 Stage 0 / three-stage: 0–1 CV text extraction quality (distinct from hybrid evidence confidence). */
  parseQualityScore?: number | null;
  /** Hybrid v2: 0–1 evidence-richness confidence (`v2_score_breakdown.confidence_score`). */
  evidenceConfidenceScore?: number | null;
  /** Dual score: primary blend (20/80) stored at score time. */
  primaryScore?: number;
  /** Dual score: shadow blend (40% signal + 60% grade). */
  shadowScore?: number;
  /** Recruiter selected primary or shadow (for calibration). */
  recruiterSelected?: "primary" | "shadow" | null;
  /** Primary blend formula string for display. */
  primaryBlendFormula?: string;
  /** Shadow blend formula string for display. */
  shadowBlendFormula?: string;
  /** Which engine produced shadow_score (e.g. "v5_outcomes"); legacy TriBlend rows have none. */
  shadowBlendVersion?: string;
  holisticRationale?: string;
  interviewAngles?: string[];
  modelVersion: string;
  /** Undefined until the pipeline actually records it — never fabricate a version. */
  promptVersion?: string;
  /**
   * 1 = legacy / three-stage (default in DB). 2 = hybrid v2 (deterministic engine + v2_* columns).
   * Shown on recruiter cards so v1 and v2 scores on the same job are not confused.
   */
  scoringVersion?: number;
  scoredAt: string;
  confidence?: "high" | "medium" | "low";
  flags?: string[];
  peerReviewed?: boolean;
  pass1Score?: number;
  pass2Score?: number;
  divergence?: number;
  humanReviewRequired?: boolean;
  humanReviewReason?: string | null;
  candidateTrustScore?: number | null;
  candidateGhostRiskLabel?: "LOW" | "MEDIUM" | "HIGH" | null;
  candidateVouches?: Array<{
    voucher_name?: string;
    relationship_type?: string;
    standout_sentence?: string;
  }>;
  candidateVerificationClaims?: Array<{ claim_type?: string; status?: string }>;
  /** Authenticity check: AI-authorship likelihood signal from CV/profile text. */
  candidateAuthenticitySignal?:
    | "likely_authentic"
    | "review_carefully"
    | "likely_ai_generated"
    | null;
  candidateAuthenticityConfidence?: number | null;
  candidateAuthenticityReasons?: string[] | null;
  /** Missing must-have skills from job requirements. */
  missingMustHaves?: string[];
  /** Hybrid v2: percentile rank in role pool (fraction scoring below this candidate). */
  marketPercentile?: number | null;
  /** Stored label e.g. "Top 10% - Rare". */
  marketLabel?: string | null;
  /** 25/75 blend components when fitscore_blend_v2 is enabled. */
  skillsSignal?: number;
  intentMatch?: number;
  /** Hybrid v2: match % against ideal candidate profile. */
  idealMatchPct?: number | null;
  /** Hybrid v2: concrete gaps against ideal candidate profile. */
  idealGaps?: string[] | null;
  /** Hiring verdict label e.g. "Hidden Gem". */
  verdict?: string | null;
  /** Short action line paired with verdict. */
  verdictAction?: string | null;
  /** Candidate current role title (from join), for card header. */
  candidateCurrentRole?: string | null;
}

export type AgentType =
  | "talent_scout"
  | "hiring_signal"
  | "fitscore"
  | "scout"
  | "verify"
  | "vouch"
  | "public_apply"
  | "scheduler"
  | "consent"
  | "ghostbuster"
  | "trust_score"
  | "orchestrator"
  | "normalizer"
  | "validator"
  | "auto_reply"
  | "info_request"
  | "communication";
export type AgentRunStatus =
  | "running"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "success"
  | "error"
  | "paused"
  | "cancelled";

export interface AgentRun {
  id: string;
  agentType: AgentType;
  startedAt: string;
  completedAt: string | null;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  errorsCount: number;
  costUsd: number;
  status: AgentRunStatus;
}

export type BillingTier = "free" | "starter" | "growth" | "scale" | "enterprise";
export type CandidateTier = "free" | "visible" | "pro" | "assisted";

export interface Organisation {
  id: string;
  name: string;
  billingTier: BillingTier;
  unlockQuotaMonthly: number;
  unlocksUsedThisMonth: number;
  seatsUsed: number;
  seatsTotal: number;
  stripeCustomerId?: string;
  createdAt: string;
}

export interface Unlock {
  id: string;
  organisationId: string;
  recruiterUserId: string;
  candidateId: string;
  jobPostingId: string;
  unlockedAt: string;
}

export type ApplicationStatus =
  | "applied"
  | "viewed"
  | "shortlisted"
  | "rejected"
  | "hired"
  | "withdrawn";
export type InterestLevel = "interested" | "strong_interest";

export interface Application {
  id: string;
  candidateId: string;
  jobId: string;
  fitScoreId: string | null;
  interest: InterestLevel;
  coverNote: string | null;
  status: ApplicationStatus;
  jobTitle: string;
  companyName: string;
  overallScore: number | null;
  candidateName: string;
  candidateNameMasked: string;
  viewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Set when the application was tied to a referrer (e.g. apply link with ?ref=). */
  appliedViaReferral: boolean;
  /** Candidate requested confidential handling for this application. */
  confidentialApply: boolean;
}

export interface ActivityEvent {
  id: string;
  type:
    | "candidate_detected"
    | "fitscore_ready"
    | "job_posted"
    | "profile_claimed"
    | "unlock"
    | "agent_completed"
    | "payment";
  title: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, string>;
}

export type NotificationType =
  | "shortlist_ready"
  | "approval_needed"
  | "approval_given"
  | "interview_scheduled"
  | "application_update"
  | "hiring_request_new"
  | "orchestrator_checkpoint"
  | "orchestrator_completed"
  | "general";

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  metadata: Record<string, string>;
  createdAt: string;
}

export type HiringRequestStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "converted"
  | "rejected"
  | "on_hold"
  | "cancelled";
export type HiringRequestUrgency = "low" | "normal" | "high" | "critical";

export interface HiringRequest {
  id: string;
  organisationId: string;
  createdBy: string;
  createdByName?: string;
  title: string;
  department: string | null;
  headcount: number;
  urgency: HiringRequestUrgency;
  description: string | null;
  notes: string | null;
  status: HiringRequestStatus;
  assignedJobId: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ApprovalDecision = "approved" | "rejected";

export interface ShortlistApproval {
  id: string;
  pipelineCandidateId: string;
  approverId: string;
  approverRole: "recruiter" | "hiring_manager";
  approverName?: string;
  decision: ApprovalDecision;
  notes: string | null;
  decidedAt: string;
}

/** Match bands: 90+ Strong, 75–89 Good, 60–74 Moderate, &lt;60 Weak (expert recruiter scoring v4). */
export function getFitScoreRating(score: number): FitScoreRating {
  if (score >= 90) return "Strong Match";
  if (score >= 75) return "Good Match";
  if (score >= 60) return "Moderate";
  return "Weak";
}

// Score colouring is centralised in src/lib/score-tone.ts so FitScore, intent and
// every other 0–100 metric share one ramp and one set of thresholds (audit F-03).
export function getFitScoreColor(score: number): string {
  return scoreToneTextClass(score);
}

export function getFitScoreBgColor(score: number): string {
  return scoreToneBgClass(score);
}

export function getFitScoreGlow(score: number): string {
  switch (scoreToTone(score)) {
    case "strong":
      return "shadow-[0_0_8px_rgba(74,222,128,0.25)]";
    case "good":
      return "shadow-[0_0_8px_rgba(251,191,36,0.25)]";
    case "fair":
      return "shadow-[0_0_8px_rgba(251,146,60,0.25)]";
    default:
      return "shadow-[0_0_8px_rgba(248,113,113,0.25)]";
  }
}

export function getIntentColor(score: number): string {
  return scoreToneTextClass(score);
}

export { ROLE_LABELS, ROLE_DASHBOARD_PATH, ORG_INVITE_ROLES } from "./database";

// Interview scheduling
export interface AvailabilitySlot {
  start: string;
  end: string;
  slot_id?: string;
}

export interface InterviewBooking {
  slot_id: string;
  candidate_id?: string;
  pipeline_candidate_id?: string;
  interviewer_email?: string;
  notes?: string;
}

// Pipeline stages
export interface PipelineStage {
  id: string;
  job_id: string;
  stage_name: string;
  stage_order: number;
  feedback_template_id?: string | null;
  interviewer_user_id?: string | null;
  interviewer_email: string | null;
  interviewer_name?: string | null;
  interviewer?: {
    user_id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
  stage_type?: string;
  sla_days?: number | null;
  is_locked?: boolean;
  notify_candidate?: boolean;
  color?: string | null;
  notify_email_body?: string | null;
  created_at?: string;
}

// Messaging
export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  attachment_url: string | null;
  attachment_name: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  participant_ids: string[];
  /** Resolved participant names, from the API. */
  participants?: { id: string; name: string }[];
  /** The other participant's display name (falls back to "Unknown"). */
  display_name?: string;
  last_message: { body: string; created_at: string } | null;
  unread_count: number;
  created_at?: string;
}

// Feedback
export interface FeedbackTemplateField {
  label: string;
  type: string;
  required?: boolean;
  /** Legacy: guidance, or (for legacy select) comma-separated options. */
  description?: string;
  /** Greenhouse scorecard fields. */
  guidance?: string;
  options?: string[];
  scale?: string[];
  group?: "focus" | "other";
}

export interface FeedbackTemplate {
  id: string;
  job_id: string;
  name: string;
  fields: FeedbackTemplateField[];
  created_at?: string;
}

export interface FeedbackSubmission {
  template_id: string;
  pipeline_candidate_id: string;
  responses: Record<string, string | number>;
  overall_rating: number;
  recommendation: string;
  notes?: string;
}

// Analytics
export interface AnalyticsOverview {
  activeJobs: number;
  totalApplications: number;
  hiredCount: number;
  pendingApplications: number;
  applicationsThisMonth: number;
}

export interface TimeToHireMetric {
  job_title: string;
  avg_days_to_hire: number;
  min_days: number;
  max_days: number;
  hired_count: number;
}

export interface PipelineMetric {
  job_title: string;
  total_applications: number;
  viewed: number;
  shortlisted: number;
  hired: number;
  rejected: number;
  withdrawn: number;
  hire_rate_pct: number;
}

export interface SourceMetric {
  source: string;
  candidate_count: number;
}

export interface ActivityMetric {
  event_type: string;
  event_detail: string;
  job_title: string | null;
  event_at: string;
}

// Saved searches
export type AlertFrequency = "daily" | "weekly" | "never";

export interface SavedSearch {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  alert_enabled: boolean;
  alert_frequency: AlertFrequency;
  created_at: string;
}

// Orchestrator
export type OrchestratorRunStatus = "running" | "paused" | "completed" | "failed" | "cancelled";

export type OrchestratorStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "awaiting_approval"
  | "skipped";

export type OrchestratorStepName =
  | "source_and_score"
  | "shortlist_review"
  | "outreach"
  | "schedule_interviews"
  | "collect_feedback"
  | "hiring_decision"
  | "notify_outcome";

/**
 * Human-readable labels for orchestrator steps.
 * Keep this as the single display naming source to avoid drift across UI and backend notifications.
 */
export const ORCHESTRATOR_STEP_LABELS: Record<OrchestratorStepName, string> = {
  source_and_score: "Intelligence Sourcing",
  shortlist_review: "Shortlist Review",
  outreach: "Outreach",
  schedule_interviews: "Schedule Interviews",
  collect_feedback: "Collect Feedback",
  hiring_decision: "Hiring Decision",
  notify_outcome: "Notify Outcome",
};

export interface OrchestratorRun {
  id: string;
  job_id: string;
  status: OrchestratorRunStatus;
  current_step: OrchestratorStepName;
  config: Record<string, unknown>;
  context: Record<string, unknown>;
  started_by: string | null;
  paused_reason: string | null;
  created_at: string;
  updated_at: string;
  steps?: OrchestratorStep[];
  diagnostics?: {
    retry_attempts_total: number;
    current_step_retry_count?: number;
    last_step_error: string | null;
    stale_for_ms: number;
    run_age_ms?: number;
    max_step_retries: number;
    stuck_threshold_ms: number;
    watchdog_recoveries_total?: number;
    step_status_counts?: Record<string, number>;
  };
}

export interface OrchestratorStep {
  id: string;
  run_id: string;
  step_name: OrchestratorStepName;
  status: OrchestratorStepStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

// Email preferences
export interface EmailPreferences {
  marketing: boolean;
  job_alerts: boolean;
  application_updates: boolean;
  messages: boolean;
  interview_reminders: boolean;
  weekly_digest: boolean;
}
