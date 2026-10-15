import { NextRequest } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAuthContext,
  requireAuth,
  jsonError,
  jsonSuccess,
  handleApiError,
  parseJsonBody,
} from "@/lib/api-helpers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateOrigin } from "@/lib/security/csrf";

// Allowlist of dismissible UI hint keys (prevents arbitrary writes into the array).
const ALLOWED_HINTS = new Set(["company_setup_welcome"]);

const bodySchema = z.object({ hint: z.string().optional() });

function adminDb(): SupabaseClient {
  // Untyped view — `dismissed_hints` isn't in generated types yet.
  return createSupabaseAdmin() as unknown as SupabaseClient;
}

/** GET /api/me/dismiss-hint → { hints: string[] } the current user has permanently dismissed. */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    const { data } = await adminDb()
      .from("profiles")
      .select("dismissed_hints")
      .eq("id", ctx!.userId)
      .maybeSingle();
    const hints = (data?.dismissed_hints as string[] | null) ?? [];
    return jsonSuccess({ hints });
  } catch (err) {
    return handleApiError(err, "Failed to load dismissed hints", {
      route: "GET /api/me/dismiss-hint",
    });
  }
}

/** POST /api/me/dismiss-hint { hint } → permanently records the dismissal for the current user. */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const parsed = await parseJsonBody<{ hint?: string }>(request, "POST /api/me/dismiss-hint");
    if (parsed.errorResponse) return parsed.errorResponse;
    const validated = bodySchema.safeParse(parsed.body ?? {});
    const hint = validated.success ? validated.data.hint?.trim() : undefined;
    if (!hint || !ALLOWED_HINTS.has(hint)) return jsonError("Unknown hint", 400);

    const db = adminDb();
    const { data: row } = await db
      .from("profiles")
      .select("dismissed_hints")
      .eq("id", ctx!.userId)
      .maybeSingle();
    const current = (row?.dismissed_hints as string[] | null) ?? [];
    if (!current.includes(hint)) {
      const { error } = await db
        .from("profiles")
        .update({ dismissed_hints: [...current, hint] })
        .eq("id", ctx!.userId);
      if (error) throw error;
    }
    return jsonSuccess({ ok: true });
  } catch (err) {
    return handleApiError(err, "Failed to dismiss hint", { route: "POST /api/me/dismiss-hint" });
  }
}
