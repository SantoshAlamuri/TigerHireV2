import type { SlotBookableBy } from "@/lib/interviews/slot-bookable-by";

export type SlotSource = "recruiter_manual" | "interviewer_declared";

export type MeetingProvider = "zoom" | "teams" | "meet" | "other";

export type CreateSlotTime = {
  start_at: string;
  end_at: string;
  timezone?: string;
  source?: SlotSource;
  /** Optional live-interview join link; when set, the AI notetaker joins this interview. */
  meeting_url?: string;
  meeting_provider?: MeetingProvider;
};

export type CreateSlotsPayload = {
  slots: CreateSlotTime[];
  source?: SlotSource;
  bookable_by?: SlotBookableBy;
  owner_user_id?: string;
};

export type InterviewerOwnerOption = {
  id: string;
  label: string;
};
