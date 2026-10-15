import { NextRequest } from "next/server";
import { z } from "zod";
import {
  handleApiError,
  handleZodError,
  jsonError,
  jsonSuccess,
  parseJsonBody,
} from "@/lib/api-helpers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/config/env";
import { requirePlatformAdmin } from "@/lib/security/platform-admin";
import { validateOrigin } from "@/lib/security/csrf";
import { isPublicDomain, isValidDomain } from "@/lib/sso/domain";

const onboardSchema = z.object({
  company_name: z.string().min(2).max(120),
  primary_domain: z.string().min(3).max(255),
  plan: z.enum(["starter", "pro", "enterprise"]),
  admin_email: z.string().email(),
  admin_first_name: z.string().min(1).max(80),
  admin_last_name: z.string().min(1).max(80),
});

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const auth = await requirePlatformAdmin(request);
    if (auth.error) return auth.error;
    const actor = auth.context;

    const parsedBody = await parseJsonBody(request, "POST /api/platform/companies/onboard");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = onboardSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const domain = parsed.data.primary_domain.trim().toLowerCase();
    if (!isValidDomain(domain)) return jsonError("Invalid domain format", 422);
    if (await isPublicDomain(domain)) {
      return jsonError("Public email domains cannot be claimed by a company", 400);
    }

    const admin = createSupabaseAdmin();
    const { data: existingMapping } = await admin
      .from("company_sso_mappings")
      .select("id")
      .eq("primary_domain", domain)
      .maybeSingle();
    if (existingMapping?.id) return jsonError("Domain already exists", 400);

    // Without redirectTo the invite link dumps the user on the Supabase Site URL
    // (the marketing landing page) with unconsumed tokens — they never get to set
    // a password. Route through the auth callback like the password-reset flow.
    const invite = await admin.auth.admin.inviteUserByEmail(
      parsed.data.admin_email.trim().toLowerCase(),
      { redirectTo: `${env.baseUrl}/api/auth/callback?next=/reset-password` },
    );
    if (invite.error || !invite.data.user?.id) {
      return jsonError("Failed to send admin invite", 500);
    }
    const adminUserId = invite.data.user.id;

    const onboardRes = await admin.rpc("platform_onboard_company", {
      p_company_name: parsed.data.company_name,
      p_primary_domain: domain,
      p_plan: parsed.data.plan,
      p_admin_user_id: adminUserId,
      p_admin_first_name: parsed.data.admin_first_name,
      p_admin_last_name: parsed.data.admin_last_name,
      p_actor_user_id: actor.userId,
    });

    if (onboardRes.error || !onboardRes.data?.[0]) {
      await admin.auth.admin.deleteUser(adminUserId);
      return jsonError("Failed to onboard company", 500);
    }

    const row = onboardRes.data[0] as { company_id: string; admin_user_id: string };
    const metadataUpdate = await admin.auth.admin.updateUserById(adminUserId, {
      user_metadata: {
        company_id: row.company_id,
        user_id: row.admin_user_id,
        role: "leadership",
      },
    });
    if (metadataUpdate.error) {
      await admin.from("organisations").delete().eq("id", row.company_id);
      await admin.auth.admin.deleteUser(adminUserId);
      return jsonError("Failed to finalize company onboarding", 500);
    }

    return jsonSuccess(
      {
        company_id: row.company_id,
        admin_user_id: row.admin_user_id,
      },
      201,
    );
  } catch (error) {
    return handleApiError(error, "Failed to onboard company", {
      route: "POST /api/platform/companies/onboard",
    });
  }
}
