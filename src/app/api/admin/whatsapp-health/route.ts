import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { getCircuitBreaker } from "@/lib/utils/circuit-breaker";

/**
 * GET /api/admin/whatsapp-health (super_admin) — aggregate WhatsApp send health so
 * a delivery-failure spike is queryable instead of invisible. Reports the outbound
 * delivery_status breakdown (1h / 24h), the count of send failures parked in the
 * DLQ, and the process-local circuit-breaker state.
 */
const ROW_CAP = 5000;

type Bucket = {
  total: number;
  delivered: number;
  read: number;
  failed: number;
  sent: number;
  pending: number;
};

function emptyBucket(): Bucket {
  return { total: 0, delivered: 0, read: 0, failed: 0, sent: 0, pending: 0 };
}

function classify(status: string | null): Exclude<keyof Bucket, "total"> {
  switch (status) {
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "failed":
      return "failed";
    case "sent":
      return "sent";
    default:
      return "pending";
  }
}

export async function GET(_request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const supabase = createSupabaseAdmin();
    const now = Date.now();
    const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const since1hMs = now - 60 * 60 * 1000;
    const scoringCallbackStaleAt = new Date(now - 10 * 60 * 1000).toISOString();
    const jdApprovalStaleAt = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await supabase
      .from("whatsapp_message_log")
      .select("delivery_status, created_at")
      .eq("direction", "outbound")
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(ROW_CAP);
    if (error) return jsonError(`whatsapp_message_log query failed: ${error.message}`, 500);

    const b24 = emptyBucket();
    const b1 = emptyBucket();
    for (const r of rows ?? []) {
      const key = classify((r as { delivery_status: string | null }).delivery_status);
      b24.total += 1;
      b24[key] += 1;
      const ts = Date.parse((r as { created_at: string }).created_at);
      if (Number.isFinite(ts) && ts >= since1hMs) {
        b1.total += 1;
        b1[key] += 1;
      }
    }
    const capped = (rows?.length ?? 0) >= ROW_CAP;

    const { count: dlqCount, error: dlqErr } = await supabase
      .from("failed_operations")
      .select("*", { count: "exact", head: true })
      .eq("operation_type", "whatsapp_send")
      .gte("created_at", since24h);
    if (dlqErr) return jsonError(`failed_operations query failed: ${dlqErr.message}`, 500);

    const { count: stalledScoringCallbacks, error: stalledScoringErr } = await supabase
      .from("whatsapp_sessions")
      .select("*", { count: "exact", head: true })
      .eq("session_state", "preferences_complete")
      .contains("context", { fit_score_eval_in_progress: true })
      .lte("last_message_at", scoringCallbackStaleAt);
    if (stalledScoringErr) {
      return jsonError(`whatsapp_sessions query failed: ${stalledScoringErr.message}`, 500);
    }

    const { count: stalePendingJdApproval, error: stalePendingErr } = await supabase
      .from("pending_jd_approval")
      .select("*", { count: "exact", head: true })
      .lte("enqueued_at", jdApprovalStaleAt);
    if (stalePendingErr) {
      return jsonError(`pending_jd_approval query failed: ${stalePendingErr.message}`, 500);
    }

    const failureRate24h = b24.total > 0 ? Number((b24.failed / b24.total).toFixed(4)) : 0;

    return jsonSuccess({
      windows: {
        "1h": b1,
        "24h": { ...b24, failure_rate: failureRate24h },
      },
      dlq: { whatsapp_send_24h: dlqCount ?? 0 },
      // In-memory breaker is per-serverless-instance, so this reflects only the
      // instance that served this request — a hint, not the fleet-wide truth.
      circuit_breaker: {
        whatsapp: getCircuitBreaker("whatsapp").getState(),
        process_local: true,
      },
      promises: {
        stalled_scoring_callbacks_10m: stalledScoringCallbacks ?? 0,
        pending_jd_approval_over_24h: stalePendingJdApproval ?? 0,
      },
      capped,
      generated_at: new Date(now).toISOString(),
    });
  } catch (err) {
    return handleApiError(err, "Failed to load WhatsApp health", {
      route: "/api/admin/whatsapp-health",
    });
  }
}
