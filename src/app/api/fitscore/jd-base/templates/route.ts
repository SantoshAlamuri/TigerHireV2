import { NextRequest } from "next/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { isEnabled } from "@/lib/feature-flags";
import { FEATURE_FLAG_HYBRID_V2, getIndiaJdTemplates } from "@/lib/fitscore/hybrid";

export async function GET(_request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!(await isEnabled(FEATURE_FLAG_HYBRID_V2, ctx.organisationId))) {
      return jsonError("Hybrid FitScore v2 is not enabled.", 403);
    }

    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "agency", "hiring_manager")) {
      return jsonError("Forbidden", 403);
    }

    const templates = getIndiaJdTemplates()
      .map((t) => ({
        id: t.id,
        category: t.category,
        roleTitle: t.roleTitle,
      }))
      .toSorted((a, b) => {
        const c = a.category.localeCompare(b.category);
        if (c !== 0) return c;
        return a.roleTitle.localeCompare(b.roleTitle);
      });

    return jsonSuccess({ templates });
  } catch (err) {
    return handleApiError(err, "Failed to list JD templates", {
      route: "GET /api/fitscore/jd-base/templates",
    });
  }
}
