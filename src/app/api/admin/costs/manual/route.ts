import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
  handleZodError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { recordManualPlatformCost } from "@/lib/costs/ledger";

const ManualCostSchema = z.object({
  provider: z.enum(["vercel", "supabase", "anthropic", "meta"]),
  amountUsd: z.number().finite().min(0).max(1_000_000),
  periodKey: z.string().trim().min(1).max(120),
  service: z.string().trim().min(1).max(80).optional(),
  occurredAt: z.string().datetime().optional(),
  notes: z.string().trim().max(500).optional(),
});

/**
 * Super-admin manual USD line item for platform costs. Use when a provider's
 * billing API is unreachable (Meta WhatsApp without Graph access, an
 * Anthropic invoice that hasn't shown up in cost_report yet, an off-platform
 * Supabase add-on charge, etc.). `provider + periodKey` is the dedupe key —
 * re-submitting overwrites the prior entry.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

    const parsed = ManualCostSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const { externalId } = await recordManualPlatformCost({
      provider: parsed.data.provider,
      amountUsd: parsed.data.amountUsd,
      periodKey: parsed.data.periodKey,
      service: parsed.data.service,
      occurredAt: parsed.data.occurredAt,
      notes: parsed.data.notes,
      enteredByUserId: ctx.userId,
    });

    return jsonSuccess({ saved: true, externalId });
  } catch (err) {
    return handleApiError(err, "Failed to record manual platform cost", {
      route: "POST /api/admin/costs/manual",
    });
  }
}
