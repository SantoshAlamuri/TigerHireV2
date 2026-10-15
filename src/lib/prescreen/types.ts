/** Per-channel pre-screen gate (Phase 3, Option A) shared types. */

export type PrescreenChannel = "whatsapp" | "form" | "email" | "board";

/**
 * When a question is asked:
 * - apply: knockout pre-screen at application time (a NO gates the candidate out).
 * - post_shortlist: deeper questions sent when the candidate is shortlisted; a NO
 *   on any gating question gates the candidate out (same resolver as apply).
 */
export type PrescreenStage = "apply" | "post_shortlist";

export type PrescreenSessionState = "awaiting_consent" | "awaiting_reply" | "reminded" | "complete";

/** Stored on applications.gate_status. NULL = no gate / flag off. */
export type GateStatus = "pending" | "passed" | "failed" | "unverified";

/** Terminal (or skipped) outcome of evaluating the gate. */
export type PrescreenGateOutcome =
  | { status: "passed" }
  | { status: "failed"; reason: string }
  | { status: "unverified"; unverifiedMustHaves: string[] }
  | { status: "skipped" };

export interface PrescreenSession {
  id: string;
  application_id: string | null;
  job_id: string;
  candidate_id: string;
  channel: PrescreenChannel;
  stage: PrescreenStage;
  state: PrescreenSessionState;
  current_question_index: number;
  questions_sent_at: string | null;
  reminder_sent_at: string | null;
  completed_at: string | null;
  /** Set when the candidate explicitly replied NO at the consent step (opt-out, not timeout). */
  declined_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrescreenQuestionRow {
  id: string;
  jd_base_document_id: string;
  requirement_id: string | null;
  question_text: string;
  answer_type: "yes_no" | "range" | "single_select";
  options: string[] | null;
  gating: boolean;
  ask_stage: PrescreenStage;
}
