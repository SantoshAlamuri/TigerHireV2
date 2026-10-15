import type { PrescreenChannel } from "@/lib/prescreen/types";

const UPLOAD_SOURCES = new Set([
  "recruiter_upload",
  "agency_upload",
  "agency_bulk_upload",
  "company_bulk_upload",
]);

/**
 * Map application source to prescreen channel. CV uploads with a reachable phone use
 * WhatsApp so candidates receive the company/role intro and gating questions.
 */
export function resolvePrescreenChannel(source?: string, phone?: string | null): PrescreenChannel {
  switch (source) {
    case "whatsapp":
      return "whatsapp";
    case "email":
    case "email_intake":
      return "email";
    case "job_board":
    case "board":
      return "board";
    default:
      if (source && UPLOAD_SOURCES.has(source)) {
        return phone ? "whatsapp" : "form";
      }
      return phone ? "whatsapp" : "form";
  }
}
