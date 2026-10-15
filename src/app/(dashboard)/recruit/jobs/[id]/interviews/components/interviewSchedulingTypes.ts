export interface PipelineCandidate {
  id: string;
  candidate_id: string;
  job_id?: string;
  stage_id?: string | null;
  candidates: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
}

import type { SlotDeliveryFields } from "@/lib/interviews/delivery-status";

export interface SlotWithStatus extends SlotDeliveryFields {
  id?: string;
  slot_id?: string;
  start: string;
  end: string;
  status: "available" | "booked";
  booked_by?: string;
  interviewer_email?: string | null;
  pipeline_candidate_id?: string | null;
  /** Recruiter who created this availability window (from interview_availability_slots.user_id). */
  slot_owner_id?: string | null;
  slot_owner_name?: string | null;
}
