import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createBillingPortalSession } from "@/lib/services/stripe";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";
import { validateOrigin } from "@/lib/security/csrf";

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const supabase = await createSupabaseServerClient();
    let stripeCustomerId: string | null = null;

    if (hasRole(ctx, "leadership") && ctx.organisationId) {
      const { data: org } = await supabase
        .from("organisations")
        .select("stripe_customer_id")
        .eq("id", ctx.organisationId)
        .single();
      stripeCustomerId = org?.stripe_customer_id ?? null;
    } else {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("user_id", ctx.userId)
        .single();
      stripeCustomerId = sub?.stripe_customer_id ?? null;
    }

    if (!stripeCustomerId) {
      return jsonError("No billing account found", 404);
    }

    const returnUrl = hasRole(ctx, "leadership")
      ? `${env.baseUrl}/company/billing`
      : `${env.baseUrl}/candidate/settings`;

    const session = await createBillingPortalSession(stripeCustomerId, returnUrl);

    return jsonSuccess({ url: session.url });
  } catch (err) {
    return handleApiError(err, "Failed to create billing portal session", {
      route: "POST /api/billing/portal",
    });
  }
}
