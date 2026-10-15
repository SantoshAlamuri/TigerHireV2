import { NextRequest } from "next/server";
import {
  getAuthContext,
  requireAuth,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { hasAnyEnterpriseRole } from "@/lib/security/enterprise-roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { initiateSpringVerifyForApplication } from "@/lib/integrations/springverify/workflow";
import { z } from "zod";

const bodySchema = z.object({
  applicationId: z.string().uuid(),
});

/**
 * POST /api/integrations/springverify/initiate
 * Starts a background verification case in SpringVerify when env is configured.
 * Body: { applicationId }
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);

    const supabase = await createSupabaseServerClient();
    const allowed = await hasAnyEnterpriseRole(
      ctx.userId,
      ["leadership", "recruiter", "hiring_manager", "super_admin"],
      supabase,
    );
    if (!allowed) return jsonError("Forbidden", 403);

    const { body, errorResponse } = await parseJsonBody(request, "POST springverify/initiate");
    if (errorResponse) return errorResponse;
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid body", 400);

    const result = await initiateSpringVerifyForApplication({
      applicationId: parsed.data.applicationId,
      initiatedBy: ctx.userId,
      expectedOrganisationId: ctx.organisationId,
      source: "api",
    });

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonSuccess({ ok: true, springverify: result.response });
  } catch (err) {
    return handleApiError(err, "SpringVerify initiate failed", {
      route: "POST /api/integrations/springverify/initiate",
    });
  }
}
