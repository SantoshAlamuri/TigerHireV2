import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthContext, jsonError, jsonSuccess } from "@/lib/api-helpers";

const querySchema = z.object({
  parent: z.string().uuid("Valid parent referrer id required"),
});

/**
 * GET /api/refer/invite-meta?parent=<referrerId>
 * Resolve inviter display info and whether current signed-in user opened their own invite link.
 */
export async function GET(request: NextRequest) {
  const parent = request.nextUrl.searchParams.get("parent");
  const parsed = querySchema.safeParse({ parent });
  if (!parsed.success) return jsonError("Invalid invite link.", 400);

  const admin = createSupabaseAdmin();
  const { data: inviter } = await admin
    .from("referrers")
    .select("id, name")
    .eq("id", parsed.data.parent)
    .maybeSingle();

  if (!inviter?.id) {
    return jsonError("Invite link is no longer valid.", 404);
  }

  const ctx = await getAuthContext();
  let selfInvite = false;
  if (ctx?.userId) {
    const { data: myReferrer } = await admin
      .from("referrers")
      .select("id")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    selfInvite = Boolean(myReferrer?.id && myReferrer.id === inviter.id);
  }

  return jsonSuccess({
    inviter: {
      id: inviter.id as string,
      name: (inviter.name as string | null | undefined)?.trim() || "Referrer",
    },
    selfInvite,
  });
}
