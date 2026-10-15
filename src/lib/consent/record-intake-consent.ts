import type { SupabaseClient } from "@supabase/supabase-js";
import { ConsentService } from "@/lib/services/ConsentService";
import { logger } from "@/lib/observability/logger";

/**
 * DPDP intake-consent policy for NON-WhatsApp channels.
 *
 * Context: the only pre-existing consent-write path is WhatsApp (phone-keyed,
 * obtained_via="whatsapp_message"). Every candidate created via the apply page,
 * email intake, or a recruiter/agency bulk upload previously got ZERO consent
 * record. This module closes that gap by writing a candidate_id-keyed record at
 * intake time, choosing the lawful basis from how the CV arrived.
 *
 * Two bases:
 *  - EXPLICIT OPT-IN  (candidate ticked a consent box, e.g. the web apply form):
 *      consent_given=true, obtained_via="web_form", grants the required types.
 *  - RECRUITER-SUBMITTED (email intake / recruiter_upload / agency_upload / a
 *    public apply with no explicit checkbox yet): consent_given=false, a
 *    provenance/basis record keyed on the source. This records HOW the CV
 *    arrived without falsely asserting candidate opt-in, so consent-gated
 *    outbound (marketing) stays suppressed for these candidates until they
 *    consent for real.
 *
 * ⚠️ LEGAL PLACEHOLDER: the recruiter-submitted basis wording below is a
 * placeholder pending review by whoever owns DPDP posture. See
 * scratchpad/brief-intake-consent-and-merge.md → open question 1. Do not treat
 * it as approved legal text.
 */

const EXPLICIT_OPT_IN_TYPES = ["cv_processing", "profile_storage", "recruiter_visibility"] as const;

/** Recruiter-submitted rows only assert processing provenance, nothing candidate-facing. */
const RECRUITER_SUBMITTED_TYPES = ["cv_processing"] as const;

function recruiterSubmittedBasisText(channel: string): string {
  // NOTE: India's DPDP Act 2023 does not carry GDPR-style "legitimate interest" as a broad
  // lawful basis. The defensible framing for a recruiter-submitted CV is: the recruiter/
  // employer (Data Fiduciary) shared it for a specific recruitment purpose and TigerHire
  // processes it on their instructions (Data Processor), with candidate notice + erasure
  // rights preserved. This is provenance, NOT the candidate's own consent.
  // ⚠️ DRAFT pending sign-off by TigerHire's DPDP owner — not final legal text.
  return (
    `CV submitted to TigerHire by a recruiter/employer via ${channel} for the purpose of a ` +
    `specific recruitment process. TigerHire processes it on the recruiter's instructions to ` +
    `evaluate the candidate for that role; purpose is limited to recruitment. This record is ` +
    `provenance of how the CV was received, not the candidate's own consent — the candidate ` +
    `retains the right to notice, access, and erasure. [DRAFT — pending DPDP sign-off.]`
  );
}

export interface IntakeConsentInput {
  candidateId: string;
  /** The applications.source string for this intake (e.g. "email_intake", "recruiter_upload", "direct"). */
  source?: string | null;
  phone?: string | null;
  /** Present only when the candidate explicitly ticked a consent box at intake. */
  consent?: { given: boolean; ipAddress?: string | null } | null;
  /** WhatsApp opt-in checkbox state on the apply form (only meaningful with explicit consent). */
  whatsappOptIn?: boolean;
}

export type IntakeConsentOutcome =
  | { basis: "explicit_opt_in"; written: number; skipped: boolean }
  | { basis: "recruiter_submitted"; channel: string; written: number; skipped: boolean };

/**
 * Decide + write the intake consent record. Pure policy on top of
 * {@link ConsentService.recordConsentForCandidate} (which is idempotent per
 * candidate_id+obtained_via).
 */
export async function recordIntakeConsent(
  supabase: SupabaseClient,
  input: IntakeConsentInput,
): Promise<IntakeConsentOutcome> {
  if (input.consent?.given === true) {
    const types = [
      ...EXPLICIT_OPT_IN_TYPES,
      ...(input.whatsappOptIn === true ? (["whatsapp_communication"] as const) : []),
    ];
    const res = await ConsentService.recordConsentForCandidate(supabase, {
      candidateId: input.candidateId,
      phone: input.phone ?? null,
      consentTypes: types,
      consentGiven: true,
      obtainedVia: "web_form",
      ipAddress: input.consent.ipAddress ?? null,
    });
    return { basis: "explicit_opt_in", written: res.written, skipped: res.skipped };
  }

  const channel = (input.source ?? "unknown").trim() || "unknown";
  const res = await ConsentService.recordConsentForCandidate(supabase, {
    candidateId: input.candidateId,
    phone: input.phone ?? null,
    consentTypes: RECRUITER_SUBMITTED_TYPES,
    consentGiven: false,
    obtainedVia: channel,
    consentText: recruiterSubmittedBasisText(channel),
  });
  return { basis: "recruiter_submitted", channel, written: res.written, skipped: res.skipped };
}

/**
 * Best-effort wrapper for the ingest funnel: never throws, logs a distinct warn on
 * failure so a DB hiccup can't take down an apply (guardrail: every degraded path
 * gets its own warn event).
 */
export async function recordIntakeConsentBestEffort(
  supabase: SupabaseClient,
  input: IntakeConsentInput,
): Promise<void> {
  try {
    await recordIntakeConsent(supabase, input);
  } catch (err) {
    logger.warn("Intake consent write failed (apply not blocked)", {
      candidateId: input.candidateId,
      source: input.source ?? null,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
