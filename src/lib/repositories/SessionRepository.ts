import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

const WHATSAPP_SESSION_COLUMNS =
  "id, phone, session_state, context, last_message_at, last_candidate_message_at, created_at, updated_at";

export const SessionRepository = {
  async getState(supabase: SupabaseClient, phone: string) {
    const normalized = phone.replace(/\D/g, "");
    if (!normalized) return null;
    const { data } = await supabase
      .from("whatsapp_sessions")
      .select(WHATSAPP_SESSION_COLUMNS)
      .eq("phone", normalized)
      .single();
    return data;
  },

  async setState(supabase: SupabaseClient, phone: string, state: Record<string, unknown>) {
    const normalized = phone.replace(/\D/g, "");
    if (!normalized) return;
    const sessionState = state.state as string | undefined;
    const payload: Record<string, unknown> = {
      phone: normalized,
      last_message_at: new Date().toISOString(),
    };
    if (sessionState !== undefined) {
      payload.session_state = sessionState;
    }
    const { error } = await supabase
      .from("whatsapp_sessions")
      .upsert(payload, { onConflict: "phone" });
    if (error) throw error;
  },

  async updateLastCandidateMessage(supabase: SupabaseClient, phone: string) {
    const normalized = phone.replace(/\D/g, "");
    if (!normalized) return;
    const { error } = await supabase
      .from("whatsapp_sessions")
      .update({ last_candidate_message_at: new Date().toISOString() })
      .eq("phone", normalized);
    if (error) {
      logger.error("updateLastCandidateMessage failed", {
        phone: normalized,
        message: error.message,
      });
    }
  },

  async isWithin24HrWindow(supabase: SupabaseClient, phone: string): Promise<boolean> {
    const session = await SessionRepository.getState(supabase, phone);
    if (!session?.last_candidate_message_at) return false;
    const elapsed = Date.now() - new Date(session.last_candidate_message_at).getTime();
    return elapsed < 24 * 60 * 60 * 1000;
  },

  /**
   * Returns true if this phone has ever messaged our business number.
   * Marketing templates only deliver to opted-in numbers.
   */
  async hasOptedIn(supabase: SupabaseClient, phone: string): Promise<boolean> {
    const normalized = phone.replace(/[^0-9]/g, "");
    const session = await SessionRepository.getState(supabase, normalized);
    return Boolean(session?.last_candidate_message_at);
  },

  /**
   * Create a WhatsApp session with context if one does not exist.
   * Used when an employee refers a candidate: we pre-create the session so when
   * the candidate messages us we have referral context and can show "referred" consent.
   */
  async createSessionIfNotExists(
    supabase: SupabaseClient,
    phone: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    const normalized = phone.replace(/[^0-9]/g, "");
    if (!normalized) return;
    const { data: existing } = await supabase
      .from("whatsapp_sessions")
      .select("id")
      .eq("phone", normalized)
      .maybeSingle();
    if (existing) return;

    await supabase.from("whatsapp_sessions").insert({
      phone: normalized,
      session_state: "new",
      context,
      last_message_at: new Date().toISOString(),
    });
  },

  /**
   * Create or merge referral context on an existing WhatsApp session.
   * Used when an employee re-refers the same phone for a new role.
   */
  async mergeReferralContext(
    supabase: SupabaseClient,
    phone: string,
    contextPatch: Record<string, unknown>,
  ): Promise<void> {
    const normalized = phone.replace(/[^0-9]/g, "");
    if (!normalized) return;

    const existing = await SessionRepository.getState(supabase, normalized);
    if (!existing) {
      await SessionRepository.createSessionIfNotExists(supabase, normalized, contextPatch);
      return;
    }

    const prior =
      existing.context && typeof existing.context === "object" && !Array.isArray(existing.context)
        ? (existing.context as Record<string, unknown>)
        : {};
    const merged = { ...prior, ...contextPatch };

    const { error } = await supabase
      .from("whatsapp_sessions")
      .update({
        context: merged,
        last_message_at: new Date().toISOString(),
      })
      .eq("phone", normalized);
    if (error) throw error;
  },
};
