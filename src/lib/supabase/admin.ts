import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;

/**
 * Service-role Supabase client — bypasses RLS.
 * Use ONLY in server-side code (API routes, agents, webhooks).
 * Cached per process to avoid creating a new client on every call.
 *
 * Audit: every call site is documented in docs/ADMIN_CLIENT_AUDIT.md.
 * Prefer createSupabaseServerClient() when RLS is sufficient (org-scoped reads/writes).
 */
export function createSupabaseAdmin(): SupabaseClient {
  if (!_admin) {
    // Server-side: prefer SUPABASE_INTERNAL_URL (direct Supabase URL) to avoid loopback
    // when NEXT_PUBLIC_SUPABASE_URL is a proxied custom domain (e.g. api.tigerhire.io → Vercel).
    const url = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !serviceKey) {
      throw new Error(
        "Supabase env vars (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are required for admin client. Check your .env.local file.",
      );
    }
    _admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _admin;
}
