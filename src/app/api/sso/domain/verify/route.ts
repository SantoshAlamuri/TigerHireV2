import { NextRequest } from "next/server";
import {
  handleApiError,
  jsonError,
  jsonSuccess,
  getAuthContext,
  hasRole,
  requireAuth,
} from "@/lib/api-helpers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";
import { writeAuditLog } from "@/lib/repositories/integrations.repository";
import { validateOrigin } from "@/lib/security/csrf";
import { verifyDnsTxt } from "@/lib/sso/verification";
import { z } from "zod";

const verifyDomainBodySchema = z.object({}).strict();

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
    const bodyParsed = verifyDomainBodySchema.safeParse(body ?? {});
    if (!bodyParsed.success) return jsonError("Invalid request body", 400);

    const limiter = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "sso-domain-verify",
        organisationId: ctx.organisationId,
        userId: ctx.userId,
      }),
      limit: 5,
      windowSecs: 3600,
    });
    if (!limiter.allowed) return jsonError("Too many attempts. Try again in an hour.", 429);

    const admin = createSupabaseAdmin();
    const { data: mapping, error: mappingError } = await admin
      .from("company_sso_mappings")
      .select("id, company_id, primary_domain, domain_verification_token, provider_type")
      .eq("company_id", ctx.organisationId)
      .maybeSingle();
    if (mappingError) return jsonError("Failed to read SSO mapping", 500);
    if (!mapping?.domain_verification_token) return jsonError("No verification initiated", 400);

    const verified = await verifyDnsTxt(
      String(mapping.primary_domain),
      String(mapping.domain_verification_token),
    );
    const checkedAt = new Date().toISOString();
    if (!verified) {
      return jsonSuccess(
        {
          verified: false,
          checked_at: checkedAt,
          reason: "TXT record not found. DNS propagation can take up to 60 minutes.",
        },
        200,
      );
    }

    const { error: updateError } = await admin
      .from("company_sso_mappings")
      .update({
        domain_verified_at: checkedAt,
        domain_verification_token: null,
        status: "active",
      })
      .eq("id", mapping.id);
    if (updateError) return jsonError("Failed to save verification status", 500);

    await writeAuditLog(admin, {
      organisation_id: ctx.organisationId,
      actor_user_id: ctx.userId,
      actor_email: null,
      event_type: "domain.verified",
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
      verified: true,
      checked_at: checkedAt,
    });
  } catch (error) {
    return handleApiError(error, "Failed to verify domain", {
      route: "POST /api/sso/domain/verify",
    });
  }
}
