import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  ensureOrganisationAccess,
  jsonError,
  handleApiError,
} from "@/lib/api-helpers";
import { hasAnyEnterpriseRole } from "@/lib/security/enterprise-roles";
import { getRequestClientIp } from "@/lib/audit/client-ip";
import { insertOfferEvent } from "@/lib/offers/offer-events";
import { forbidUnlessHiringManagerOwnsOfferJob } from "@/lib/security/hiring-manager-offer-access";

/**
 * GET /api/offers/[id]/download-signed — authenticated recruiters download the native signed PDF.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const supabase = await createSupabaseServerClient();
    const allowed = await hasAnyEnterpriseRole(
      ctx.userId,
      ["leadership", "recruiter", "hiring_manager", "finance", "super_admin"],
      supabase,
    );
    if (!allowed) return jsonError("Forbidden", 403);

    const admin = createSupabaseAdmin();
    const { data: offer, error } = await admin
      .from("offers")
      .select(
        "id, organisation_id, status, signing_status, signed_pdf_path, applications(candidate_id)",
      )
      .eq("id", id)
      .maybeSingle();

    if (error || !offer) return jsonError("Offer not found", 404);
    const orgErr = ensureOrganisationAccess(ctx, offer.organisation_id as string);
    if (orgErr) return orgErr;
    const hmErr = await forbidUnlessHiringManagerOwnsOfferJob({ ctx, admin, offerId: id });
    if (hmErr) return hmErr;

    if ((offer.status as string) !== "accepted" && offer.signing_status !== "signed") {
      return jsonError("Signed PDF not available", 404);
    }
    const path = (offer.signed_pdf_path as string | null) ?? "";
    if (!path) return jsonError("Signed PDF not available", 404);

    const { data: file, error: dlErr } = await admin.storage.from("signed-offers").download(path);
    if (dlErr || !file) return jsonError("Could not load signed PDF", 500);

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

    const ip = getRequestClientIp(request) ?? "";
    await insertOfferEvent(admin, {
      offerId: id,
      eventType: "downloaded",
      actorIp: ip,
      actorUserAgent: request.headers.get("user-agent"),
      metadata: { source: "recruiter_dashboard" },
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
    return handleApiError(err, "Failed to download signed offer", {
      route: "GET /api/offers/[id]/download-signed",
    });
  }
}
