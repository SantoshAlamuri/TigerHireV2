import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { jsonError, handleApiError } from "@/lib/api-helpers";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getRequestClientIp } from "@/lib/audit/client-ip";
import { insertOfferEvent } from "@/lib/offers/offer-events";

/**
 * GET /api/offers/public/[token]/download — stream signed PDF for a completed native offer.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token || token.length < 16) return jsonError("Offer link not found", 404);

    const ip =
      getRequestClientIp(request) ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const rl = await checkRateLimit({
      key: `offer-pub-dl:${ip}:${token.slice(0, 12)}`,
      limit: 40,
      windowSecs: 120,
    });
    if (!rl.allowed) {
      return jsonError("Too many requests. Please try again later.", 429);
    }

    const admin = createSupabaseAdmin();
    const { data: offer, error } = await admin
      .from("offers")
      .select("id, status, signing_status, signed_pdf_path, applications(candidate_id)")
      .eq("public_token", token)
      .maybeSingle();

    if (error || !offer) return jsonError("Offer link not found", 404);
    if ((offer.status as string) !== "accepted" && offer.signing_status !== "signed") {
      return jsonError("Signed PDF not available", 404);
    }

    const path = (offer.signed_pdf_path as string | null) ?? "";
    if (!path) return jsonError("Signed PDF not available", 404);

    const { data: file, error: dlErr } = await admin.storage.from("signed-offers").download(path);
    if (dlErr || !file) {
      return jsonError("Could not load signed PDF", 500);
    }

    const buf = Buffer.from(await file.arrayBuffer());

    const apps = offer.applications as { candidate_id?: string } | null;
    const cid = apps?.candidate_id as string | undefined;
    let nm = "candidate";
    if (cid) {
      const { data: cand } = await admin
        .from("candidates")
        .select("name, full_name")
        .eq("id", cid)
        .maybeSingle();
      nm =
        ((cand?.full_name as string | null) ?? "").trim() ||
        ((cand?.name as string | null) ?? "").trim() ||
        "candidate";
    }
    const safe = nm.replace(/[^\w.-]+/g, "_").slice(0, 60);

    await insertOfferEvent(admin, {
      offerId: offer.id as string,
      eventType: "downloaded",
      actorIp: ip,
      actorUserAgent: request.headers.get("user-agent"),
    });

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="offer-${safe}-signed.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to download offer", {
      route: "GET /api/offers/public/[token]/download",
    });
  }
}
