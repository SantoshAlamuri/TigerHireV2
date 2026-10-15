import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";
import type { AuthContext } from "@/lib/api-helpers";
import { hasRole, jsonError } from "@/lib/api-helpers";

/**
 * Admin-backed dashboard routes under `src/app/api/offers/` use `createSupabaseAdmin()`, which
 * bypasses RLS. For users whose primary role is `hiring_manager`, call
 * `forbidUnlessHiringManagerOwnsOfferJob` on every mutating or sensitive read that loads an offer by id.
 *
 * Routes that currently invoke this helper (keep in sync when adding handlers):
 * - PATCH  /api/offers/[id]
 * - POST   /api/offers/[id]/return-to-draft
 * - POST   /api/offers/[id]/recall
 * - POST   /api/offers/[id]/send
 * - POST   /api/offers/[id]/hiring-manager-approve
 * - GET    /api/offers/[id]/signing
 * - POST   /api/offers/[id]/signing/remind
 * - POST   /api/offers/[id]/signing/extend
 * - GET    /api/offers/[id]/download-signed
 *
 * Intentionally not using this helper (different auth model or role gate):
 * - POST /api/offers — HM scoped on `applicationId` before insert (job must be theirs; null HM rejected).
 * - POST /api/offers/[id]/finance — finance / leadership / super_admin only.
 * - POST /api/offers/[id]/response — candidate-owned offer response.
 * - `public/[token]/*` — unauthenticated token flows (OTP, sign, view, etc.).
 */

type OfferJobHmRow = {
  applications:
    | { jobs: { hiring_manager_id: string | null } }
    | { jobs: { hiring_manager_id: string | null } }[]
    | null;
};

function hiringManagerIdFromOfferRow(data: OfferJobHmRow): string | null {
  const app = data.applications;
  if (!app) return null;
  const first = Array.isArray(app) ? app[0] : app;
  return (first?.jobs?.hiring_manager_id as string | null | undefined) ?? null;
}

/**
 * Service-role routes must enforce the same job scope as RLS: a hiring manager may only
 * access offers whose application is tied to a job where they are `hiring_manager_id`.
 */
export async function forbidUnlessHiringManagerOwnsOfferJob(params: {
  ctx: AuthContext;
  admin: SupabaseClient;
  offerId: string;
}): Promise<NextResponse | null> {
  const { ctx, admin, offerId } = params;
  if (!hasRole(ctx, "hiring_manager")) return null;

  const { data, error } = await admin
    .from("offers")
    .select("id, applications!inner(jobs!inner(hiring_manager_id))")
    .eq("id", offerId)
    .maybeSingle();

  if (error || !data) return jsonError("Offer not found", 404);

  const hmId = hiringManagerIdFromOfferRow(data as unknown as OfferJobHmRow);
  if (hmId !== ctx.userId) return jsonError("Forbidden", 403);
  return null;
}
