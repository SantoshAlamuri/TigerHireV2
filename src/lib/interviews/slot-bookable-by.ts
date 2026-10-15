import { z } from "zod";

export const slotBookableBySchema = z.enum(["candidate", "interviewer", "both"]);
export type SlotBookableBy = z.infer<typeof slotBookableBySchema>;

export const SLOT_BOOKABLE_BY_LABELS: Record<SlotBookableBy, string> = {
  candidate: "Candidates only",
  interviewer: "Team only (recruiter books)",
  both: "Candidates and team",
};

/** Slots shown on the public self-schedule page. */
export function isSelfServeBookable(bookableBy: string | null | undefined): boolean {
  const v = bookableBy ?? "both";
  return v === "candidate" || v === "both";
}

/** Slots offered in WhatsApp / automated candidate slot pickers. */
export function isCandidatePickerBookable(bookableBy: string | null | undefined): boolean {
  return isSelfServeBookable(bookableBy);
}
