import type { SupabaseClient } from "@supabase/supabase-js";

export const ConsentRepository = {
  async hasConsent(supabase: SupabaseClient, phone: string, consentType: string): Promise<boolean> {
    const { data } = await supabase
      .from("consent_records")
      .select("id")
      .eq("phone", phone)
      .eq("consent_type", consentType)
      .eq("consent_given", true)
      .limit(1)
      .maybeSingle();
    return !!data;
  },

  async hasAllRequiredConsent(supabase: SupabaseClient, phone: string): Promise<boolean> {
    const required = [
      "cv_processing",
      "profile_storage",
      "recruiter_visibility",
      "whatsapp_communication",
    ];
    const { data } = await supabase
      .from("consent_records")
      .select("consent_type")
      .eq("phone", phone)
      .eq("consent_given", true)
      .in("consent_type", required);

    const granted = new Set((data ?? []).map((r: { consent_type: string }) => r.consent_type));
    return required.every((c) => granted.has(c));
  },

  /**
   * candidate_id-keyed counterpart to {@link hasAllRequiredConsent}. Used by non-WhatsApp
   * intake channels (web form, email intake) where consent is recorded against the
   * candidate row rather than a phone string (email-only candidates have no phone).
   */
  async hasAllRequiredConsentForCandidate(
    supabase: SupabaseClient,
    candidateId: string,
  ): Promise<boolean> {
    const required = [
      "cv_processing",
      "profile_storage",
      "recruiter_visibility",
      "whatsapp_communication",
    ];
    const { data } = await supabase
      .from("consent_records")
      .select("consent_type")
      .eq("candidate_id", candidateId)
      .eq("consent_given", true)
      .in("consent_type", required);

    const granted = new Set((data ?? []).map((r: { consent_type: string }) => r.consent_type));
    return required.every((c) => granted.has(c));
  },

  /**
   * Idempotency guard for intake-consent writes: true when this candidate already has any
   * consent row recorded via the given channel, so re-delivery of the same CV (the email
   * intake endpoint is idempotent) does not stack duplicate consent rows.
   */
  async hasConsentRecordForCandidateVia(
    supabase: SupabaseClient,
    candidateId: string,
    obtainedVia: string,
  ): Promise<boolean> {
    const { data } = await supabase
      .from("consent_records")
      .select("id")
      .eq("candidate_id", candidateId)
      .eq("obtained_via", obtainedVia)
      .limit(1)
      .maybeSingle();
    return !!data;
  },

  async bulkInsert(
    supabase: SupabaseClient,
    records: Array<{
      phone?: string | null;
      candidateId?: string;
      consentType: string;
      consentGiven: boolean;
      consentText: string;
      obtainedVia: string;
      whatsappMessageId?: string;
      ipAddress?: string | null;
    }>,
  ) {
    const rows = records.map((r) => ({
      phone: r.phone ?? null,
      candidate_id: r.candidateId ?? null,
      consent_type: r.consentType,
      consent_given: r.consentGiven,
      consent_text: r.consentText,
      obtained_via: r.obtainedVia,
      whatsapp_message_id: r.whatsappMessageId ?? null,
      ip_address: r.ipAddress ?? null,
    }));
    const { error } = await supabase.from("consent_records").insert(rows);
    if (error) throw error;
  },

  async recordOptOut(supabase: SupabaseClient, phone: string) {
    await supabase.from("consent_records").update({ consent_given: false }).eq("phone", phone);
  },

  async createErasureRequest(
    supabase: SupabaseClient,
    payload: {
      candidateId?: string;
      phone?: string;
      requestedVia: string;
    },
  ) {
    const { data, error } = await supabase
      .from("erasure_requests")
      .insert({
        candidate_id: payload.candidateId ?? null,
        phone: payload.phone ?? null,
        requested_via: payload.requestedVia,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw error;
    return data;
  },

  async logRetentionDeletion(
    supabase: SupabaseClient,
    candidateId: string,
    reason: string,
    dataDeleted: Record<string, unknown>,
  ) {
    await supabase.from("retention_deletions").insert({
      candidate_id: candidateId,
      deletion_reason: reason,
      data_deleted: dataDeleted,
    });
  },
};
