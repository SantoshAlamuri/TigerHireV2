import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { validateOrigin } from "@/lib/security/csrf";
import {
  getAuthContext,
  requireAuth,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
} from "@/lib/api-helpers";
import { normalizeReferrerWhatsapp } from "@/lib/referrers/normalize-whatsapp";

const joinBodySchema = z
  .object({
    name: z.string().min(1).max(200),
    whatsapp_number: z.string().min(5).max(40),
    type: z.enum(["individual", "agency"]),
    parent_referrer_id: z.string().uuid().optional().nullable(),
    city: z.string().max(120).optional().nullable(),
    work_email: z.string().email().max(320).optional().nullable(),
    linkedin_url: z.string().max(500).optional().nullable(),
    upi_id: z.string().max(200).optional().nullable(),
  })
  .strict();

function extractEmailDomain(rawEmail: string): string | null {
  const value = rawEmail.trim().toLowerCase();
  if (!value || !value.includes("@")) return null;
  const domain = value.split("@").pop()?.trim() ?? "";
  if (!domain || domain.includes(" ")) return null;
  return domain;
}

/**
 * POST /api/refer/join — public; upsert referrer by WhatsApp (no auth).
 * New rows: status pending, whatsapp_verified false. Updates: name, type, upi, city, linkedin only.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = await checkRateLimit({
    key: `refer-join:${ip}`,
    limit: 20,
    windowSecs: 60,
  });
  if (!rl.allowed) {
    return jsonError("Too many requests. Please try again later.", 429);
  }

  const parsedBody = await parseJsonBody(request, "POST /api/refer/join");
  if (parsedBody.errorResponse) return parsedBody.errorResponse;

  const parsed = joinBodySchema.safeParse(parsedBody.body);
  if (!parsed.success) return handleZodError(parsed.error);

  const {
    name,
    whatsapp_number,
    type,
    city,
    work_email,
    linkedin_url,
    upi_id,
    parent_referrer_id,
  } = parsed.data;
  const ctx = await getAuthContext();
  const authUserId = requireAuth(ctx) ? ctx.userId : null;
  const supabase = createSupabaseAdmin();
  const { data: authReferrer } = authUserId
    ? await supabase
        .from("referrers")
        .select("id, whatsapp_number, whatsapp_verified, parent_referrer_id")
        .eq("user_id", authUserId)
        .maybeSingle()
    : { data: null };

  const requestedParentReferrerId = parent_referrer_id ?? null;
  if (requestedParentReferrerId) {
    const { data: parentRow } = await supabase
      .from("referrers")
      .select("id")
      .eq("id", requestedParentReferrerId)
      .maybeSingle();
    if (!parentRow?.id) {
      return jsonError("Invalid referral invite link.", 400);
    }
  }

  const whatsappNorm = normalizeReferrerWhatsapp(whatsapp_number);
  if (whatsappNorm.length < 8) {
    return jsonError("Please enter a valid WhatsApp number.", 400);
  }

  const upiTrimmed = upi_id?.trim() || null;
  const cityTrimmed = city?.trim() || null;
  const workEmailTrimmed = work_email?.trim().toLowerCase() || null;
  const linkedinTrimmed = linkedin_url?.trim() || null;
  const workEmailDomain = workEmailTrimmed ? extractEmailDomain(workEmailTrimmed) : null;

  let verifiedOrgId: string | null = null;
  if (workEmailDomain) {
    const { data: orgMatch } = await supabase
      .from("organisations")
      .select("id")
      .eq("email_domain", workEmailDomain)
      .maybeSingle();
    verifiedOrgId = (orgMatch?.id as string | undefined) ?? null;
  }

  // NOTE: user_id is deliberately NOT written here. Linking a referrer row to a
  // user account is done exclusively by POST /api/refer/otp/verify, which proves
  // ownership of the WhatsApp number via OTP and links only where user_id IS NULL.
  // Writing user_id from this public upsert (matched purely by whatsapp_number)
  // would let an authenticated caller claim a victim's referrer row by number.
  const updatePayload = {
    name: name.trim(),
    type,
    city: cityTrimmed,
    work_email: workEmailTrimmed,
    verified_org_id: verifiedOrgId,
    org_verified: Boolean(verifiedOrgId),
    linkedin_url: linkedinTrimmed,
    upi_id: upiTrimmed,
  };

  // Authenticated referrer profile update path:
  // OTP is only required when WhatsApp number is newly set or changed.
  if (authReferrer?.id) {
    const currentWhatsAppNorm = normalizeReferrerWhatsapp(
      (authReferrer.whatsapp_number as string | null | undefined) ?? "",
    );
    const currentVerified = Boolean(authReferrer.whatsapp_verified);
    const whatsappChanged = currentWhatsAppNorm !== whatsappNorm;
    const otpRequired = whatsappChanged || !currentVerified;
    const currentParent = (authReferrer.parent_referrer_id as string | null | undefined) ?? null;
    const nextParentReferrerId = currentParent ?? requestedParentReferrerId;
    if (nextParentReferrerId && nextParentReferrerId === (authReferrer.id as string)) {
      return jsonError("Invalid referral invite link.", 400);
    }

    const { data: updatedAuthRef, error: upErr } = await supabase
      .from("referrers")
      .update({
        ...updatePayload,
        parent_referrer_id: nextParentReferrerId,
        whatsapp_number: whatsappNorm,
        whatsapp_verified: otpRequired ? false : true,
        status: otpRequired ? "pending" : "active",
      })
      .eq("id", authReferrer.id as string)
      .select("id")
      .single();

    if (upErr || !updatedAuthRef?.id) {
      if (upErr?.code === "23505") {
        return jsonError("That WhatsApp number is already linked to another referrer.", 409);
      }
      return jsonError("Could not save your profile. Please try again.", 500);
    }

    return jsonSuccess({
      referrer_id: updatedAuthRef.id as string,
      otp_required: otpRequired,
    });
  }

  const { data: existing } = await supabase
    .from("referrers")
    .select("id, parent_referrer_id, user_id, whatsapp_verified")
    .eq("whatsapp_number", whatsappNorm)
    .maybeSingle();

  // A referrer row that is already owned (user_id set) or has proven ownership of
  // the number (whatsapp_verified) must not be mutated by this public,
  // number-matched upsert — otherwise anyone could overwrite a victim's profile
  // (including upi_id, which routes payouts). The owner manages it via the
  // authenticated path above or by verifying OTP.
  if (existing?.id && (existing.user_id || existing.whatsapp_verified)) {
    return jsonError(
      "That WhatsApp number is already registered. Please sign in and verify it via OTP to manage this referrer.",
      409,
    );
  }

  let referrerId: string | null = null;

  if (existing?.id) {
    const currentParent = (existing.parent_referrer_id as string | null | undefined) ?? null;
    const nextParentReferrerId = currentParent ?? requestedParentReferrerId;
    if (nextParentReferrerId && nextParentReferrerId === (existing.id as string)) {
      return jsonError("Invalid referral invite link.", 400);
    }
    const { data: updated, error: upErr } = await supabase
      .from("referrers")
      .update({
        ...updatePayload,
        parent_referrer_id: nextParentReferrerId,
      })
      .eq("id", existing.id as string)
      .select("id")
      .single();
    if (!upErr && updated?.id) referrerId = updated.id as string;
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("referrers")
      .insert({
        ...updatePayload,
        parent_referrer_id: requestedParentReferrerId,
        whatsapp_number: whatsappNorm,
        status: "pending",
        whatsapp_verified: false,
      })
      .select("id")
      .single();

    if (!insErr && inserted?.id) {
      referrerId = inserted.id as string;
    } else if (insErr?.code === "23505") {
      const { data: raced } = await supabase
        .from("referrers")
        .select("id, parent_referrer_id, user_id, whatsapp_verified")
        .eq("whatsapp_number", whatsappNorm)
        .maybeSingle();
      if (raced?.id && (raced.user_id || raced.whatsapp_verified)) {
        return jsonError(
          "That WhatsApp number is already registered. Please sign in and verify it via OTP to manage this referrer.",
          409,
        );
      }
      if (raced?.id) {
        const currentParent = (raced.parent_referrer_id as string | null | undefined) ?? null;
        const nextParentReferrerId = currentParent ?? requestedParentReferrerId;
        if (nextParentReferrerId && nextParentReferrerId === (raced.id as string)) {
          return jsonError("Invalid referral invite link.", 400);
        }
        const { data: updated, error: upErr } = await supabase
          .from("referrers")
          .update({
            ...updatePayload,
            parent_referrer_id: nextParentReferrerId,
          })
          .eq("id", raced.id as string)
          .select("id")
          .single();
        if (!upErr && updated?.id) referrerId = updated.id as string;
      }
    }
  }

  if (!referrerId) {
    return jsonError("Could not save your referrer profile. Please try again.", 500);
  }

  return jsonSuccess({ referrer_id: referrerId, otp_required: true });
}
