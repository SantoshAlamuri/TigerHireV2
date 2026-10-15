import { NextRequest } from "next/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  parseJsonBody,
} from "@/lib/api-helpers";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";
import { validateOrigin } from "@/lib/security/csrf";

const signalSourceEnum = z.enum(["naukri", "indeed", "linkedin", "manual", "other"]);
const ingestSignalSchema = z
  .object({
    source: signalSourceEnum,
    external_id: z.string().min(1),
    raw_data: z.record(z.string(), z.unknown()),
    signal_strength: z.number().min(0).max(100).optional(),
  })
  .strict();
const ingestBodySchema = z
  .object({
    signals: z.array(ingestSignalSchema).min(1).max(500),
  })
  .strict();

/**
 * POST /api/signals/ingest — Receive scraped candidate profiles (SignalHunt contract).
 * Deduplicates by (source, external_id). Inserts with status=raw.
 * Auth: CRON_SECRET or CRON_SECRET_HASH in Bearer header, or super_admin.
 */
export async function POST(request: NextRequest) {
  const cronSecret = await validateCronSecret(request);
  if (!cronSecret) {
    const csrf = validateOrigin(request);
    if (csrf) return csrf;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);
  }

  const identifier = cronSecret ? "cron:ingest" : "ingest";
  const rl = await checkRateLimit({
    key: identifier,
    limit: 30,
    windowSecs: 60,
  });
  if (!rl.allowed) return jsonError("Too many requests", 429);

  const { body, errorResponse } = await parseJsonBody(request, "POST /api/signals/ingest");
  if (errorResponse) return errorResponse;

  const parsed = ingestBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues.map((i) => i.message).join("; "), 422);
  }

  const admin = createSupabaseAdmin();
  const rows = parsed.data.signals.map((sig) => ({
    source: sig.source,
    external_id: sig.external_id,
    raw_data: sig.raw_data,
    signal_strength: sig.signal_strength ?? null,
    status: "raw" as const,
  }));

  const { data: insertedRows, error } = await admin
    .from("signals")
    .upsert(rows, {
      onConflict: "source,external_id",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) {
    return jsonError(`Failed to ingest signals: ${error.message}`, 500);
  }

  const inserted = insertedRows?.length ?? 0;
  return jsonSuccess({
    received: parsed.data.signals.length,
    inserted,
    skipped: parsed.data.signals.length - inserted,
    errors: [],
  });
}
