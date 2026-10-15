import { NextRequest } from "next/server";
import { handleApiError, jsonError, jsonSuccess } from "@/lib/api-helpers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthContext, hasRole, requireAuth } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/repositories/integrations.repository";
import { validateOrigin } from "@/lib/security/csrf";
import { generateVerificationToken } from "@/lib/sso/verification";
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";
import { z } from "zod";

const initiateDomainVerificationBodySchema = z.object({}).strict();

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "leadership") || ctx.roleStatus !== "active")
      return jsonError("Forbidden", 403);
    if (!ctx.organisationId) return jsonError("No organisation linked to account", 400);
    const body = await request?.json?.().catch(() => ({}));
    const bodyParsed = initiateDomainVerificationBodySchema.safeParse(body ?? {});
    if (!bodyParsed.success) return jsonError("Invalid request body", 400);
    const limiter = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "sso-domain-initiate",
        organisationId: ctx.organisationId,
        userId: ctx.userId,
      }),
      limit: 5,
      windowSecs: 60,
    });
    if (!limiter.allowed) return jsonError("Too many attempts. Try again in a minute.", 429);

    const admin = createSupabaseAdmin();
    const { data: mapping, error: mappingError } = await admin
      .from("company_sso_mappings")
      .select("id, company_id, primary_domain, provider_type")
      .eq("company_id", ctx.organisationId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (mappingError) return jsonError("Failed to read SSO mapping", 500);
    if (!mapping?.id) return jsonError("No SSO mapping found for this company", 404);

    const verificationToken = generateVerificationToken();
    const { error: updateError } = await admin
      .from("company_sso_mappings")
      .update({
        domain_verification_token: verificationToken,
      })
      .eq("id", mapping.id);
    if (updateError) return jsonError("Failed to update verification token", 500);

    await writeAuditLog(admin, {
      organisation_id: ctx.organisationId,
      actor_user_id: ctx.userId,
      actor_email: null,
      event_type: "domain.verification_initiated",
      resource_type: "company_sso_mappings",
      resource_id: String(mapping.id),
      metadata: {
        actor_type: "leadership",
        domain: mapping.primary_domain,
        provider_type: mapping.provider_type,
      },
      ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
    });

    return jsonSuccess({
      txt_record_name: `_tigerhire-verify.${mapping.primary_domain}`,
      txt_record_value: verificationToken,
    });
  } catch (error) {
    return handleApiError(error, "Failed to initiate domain verification", {
      route: "POST /api/sso/domain/initiate-verification",
    });
  }
}
