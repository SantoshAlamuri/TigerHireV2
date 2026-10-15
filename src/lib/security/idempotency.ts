import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { createHash } from "crypto";

const IDEMPOTENCY_HEADER = "idempotency-key";
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function hashKey(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}

// Only cache responses that represent a stable, replayable outcome.
// 2xx/3xx are success. 409 is "semantic conflict" (e.g., duplicate apply) — replaying
// the same key should re-serve the same conflict deterministically. Other 4xx/5xx
// (validation errors, auth failures, server errors) are transient or fixable and
// must NOT be cached — otherwise a candidate's first failed attempt sticks forever.
function shouldCacheResponse(status: number): boolean {
  return status < 400 || status === 409;
}

/**
 * If request has Idempotency-Key, return stored response for (endpoint, key) when present;
 * otherwise run handler, then store and return the response.
 * Use for POST /api/billing/checkout and POST /api/apply to avoid duplicate charges/submissions.
 * If the idempotency_keys table does not exist yet (migration not applied), runs the handler without storing.
 *
 * TTL: cached responses expire after 24h. Beyond that the lookup ignores stale rows
 * (and a nightly reaper at /api/cron/idempotency-reap deletes them).
 * Failure responses (4xx other than 409, all 5xx) are returned to the caller but NOT persisted.
 */
export async function withIdempotency(
  request: Request,
  endpoint: string,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const key = request.headers.get(IDEMPOTENCY_HEADER)?.trim();
  if (!key) return handler();

  const keyHash = hashKey(key);
  const db = createSupabaseAdmin();

  // Status 0 is an in-flight sentinel: a claim row inserted BEFORE the handler
  // runs. The UNIQUE(key_hash, endpoint) constraint means only one request can
  // hold the claim, so concurrent duplicates cannot both execute the handler.
  const IN_FLIGHT = 0;

  // Phase 1 — claim the key atomically. Infra failures here (e.g. table missing)
  // fall back to running the handler once, unguarded.
  let owns = false;
  try {
    const { error: claimErr } = await db.from("idempotency_keys").insert({
      key_hash: keyHash,
      endpoint,
      response_status: IN_FLIGHT,
      response_body: null,
    });

    if (!claimErr) {
      owns = true;
    } else if (claimErr.code === "23505") {
      const { data: existing } = await db
        .from("idempotency_keys")
        .select("response_status, response_body, created_at")
        .eq("key_hash", keyHash)
        .eq("endpoint", endpoint)
        .maybeSingle();

      if (existing) {
        if (existing.response_status === IN_FLIGHT) {
          // Another request holds the claim and is still running. Do NOT execute
          // the handler again — tell the caller to retry.
          return NextResponse.json(
            { error: "A request with this idempotency key is still being processed." },
            { status: 409 },
          );
        }
        const fresh =
          typeof existing.created_at === "string" &&
          new Date(existing.created_at).getTime() > Date.now() - IDEMPOTENCY_TTL_MS;
        if (fresh) {
          return NextResponse.json((existing.response_body as Record<string, unknown>) ?? {}, {
            status: existing.response_status as number,
          });
        }
        // Stale completed row — take it over and re-run.
        const { error: takeoverErr } = await db
          .from("idempotency_keys")
          .update({
            response_status: IN_FLIGHT,
            response_body: null,
            created_at: new Date().toISOString(),
          })
          .eq("key_hash", keyHash)
          .eq("endpoint", endpoint)
          .neq("response_status", IN_FLIGHT);
        owns = !takeoverErr;
      }
    }
    // Any other insert error → proceed without idempotency (owns stays false).
  } catch {
    return handler();
  }

  // Phase 2 — run the handler now that the claim is decided.
  let response: NextResponse;
  try {
    response = await handler();
  } catch (e) {
    if (owns) {
      // Release the claim so a retry can run rather than being stuck at 409.
      await db
        .from("idempotency_keys")
        .delete()
        .eq("key_hash", keyHash)
        .eq("endpoint", endpoint)
        .eq("response_status", IN_FLIGHT);
    }
    throw e;
  }

  if (!owns) return response;

  const status = response.status;
  if (!shouldCacheResponse(status)) {
    // Fixable/transient failure — release the claim so the caller can retry.
    await db
      .from("idempotency_keys")
      .delete()
      .eq("key_hash", keyHash)
      .eq("endpoint", endpoint)
      .eq("response_status", IN_FLIGHT);
    return response;
  }

  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    body = {};
  }
  await db
    .from("idempotency_keys")
    .update({ response_status: status, response_body: body as Record<string, unknown> })
    .eq("key_hash", keyHash)
    .eq("endpoint", endpoint);

  return response;
}
