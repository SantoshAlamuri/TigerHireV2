import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { jsonError, jsonSuccess, handleApiError } from "@/lib/api-helpers";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getRequestClientIp } from "@/lib/audit/client-ip";
import { insertOfferEvent } from "@/lib/offers/offer-events";

const publicOfferViewBodySchema = z.object({}).strict();

const publicOfferTokenParamsSchema = z.object({
  token: z.string().min(16).max(256),
});

/**
 * POST /api/offers/public/[token]/view — record candidate view (IP + UA); idempotent-friendly.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token || token.length < 16) return jsonError("Offer link not found", 404);
    const body = await request.json().catch(() => ({}));
    const bodyParsed = publicOfferViewBodySchema.safeParse(body);
    if (!bodyParsed.success) return jsonError("Invalid request body", 400);

    const ip =
      getRequestClientIp(request) ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";
    const rl = await checkRateLimit({
      key: `offer-pub-view:${ip}:${token.slice(0, 12)}`,
      limit: 60,
      windowSecs: 60,
    });
    if (!rl.allowed) {
      return jsonError("Too many requests. Please try again later.", 429);
    }

    const admin = createSupabaseAdmin();
    const { data: offer, error } = await admin
      .from("offers")
      .select(
        "id, status, signing_status, expires_at, document_content, signed_at, declined_at, expired_at",
      )
      .eq("public_token", token)
      .maybeSingle();

    if (error || !offer) return jsonError("Offer link not found", 404);

    const now = Date.now();
    const expiresAt = offer.expires_at as string | null;
    const expiredClock = expiresAt && new Date(expiresAt).getTime() < now;
    const st = offer.status as string;
    const sg = offer.signing_status as string | null;

    if (st === "withdrawn" || sg === "withdrawn") {
      return jsonError("Offer withdrawn", 410);
    }
    if (st === "accepted" || sg === "signed") {
      return jsonSuccess({ recorded: false, reason: "already_signed" });
    }
    if (st === "declined" || sg === "declined") {
      return jsonSuccess({ recorded: false, reason: "already_declined" });
    }
    if (st === "expired" || sg === "expired" || expiredClock) {
      return jsonSuccess({ recorded: false, reason: "expired" });
    }
    if (sg === "pending_company") {
      return jsonSuccess({ recorded: false, reason: "awaiting_company_signature" });
    }
    if (st !== "sent") {
      return jsonSuccess({ recorded: false, reason: "not_open" });
    }

    const ua = request.headers.get("user-agent") ?? "";
    const nowIso = new Date().toISOString();

    const { data: fresh } = await admin
      .from("offers")
      .select("first_viewed_at, view_count")
      .eq("id", offer.id as string)
      .single();

    const first = (fresh?.first_viewed_at as string | null) ?? null;
    const count = (fresh?.view_count as number | undefined) ?? 0;

    await admin
      .from("offers")
      .update({
        last_viewed_at: nowIso,
        view_count: count + 1,
        first_viewed_at: first ?? nowIso,
        signing_status: "viewed",
      })
      .eq("id", offer.id as string)
      .eq("status", "sent");

    await insertOfferEvent(admin, {
      offerId: offer.id as string,
      eventType: "viewed",
      actorIp: ip,
      actorUserAgent: ua,
    });

    return jsonSuccess({ recorded: true, viewCount: count + 1 });
  } catch (err) {
    return handleApiError(err, "Failed to record offer view", {
      route: "POST /api/offers/public/[token]/view",
    });
  }
}
