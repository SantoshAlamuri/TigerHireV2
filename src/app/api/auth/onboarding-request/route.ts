import { NextRequest } from "next/server";
import {
  handleApiError,
  handleZodError,
  jsonError,
  jsonSuccess,
  parseJsonBody,
} from "@/lib/api-helpers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendContactNotification } from "@/lib/services/resend";
import { logger } from "@/lib/observability/logger";
import { validateOrigin } from "@/lib/security/csrf";
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/security/rate-limit";
import { extractDomain, isPublicDomain, isValidDomain } from "@/lib/sso/domain";
import { onboardingRequestSchema } from "@/lib/validations/auth";

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const rl = await checkRateLimit({
      key: `onboarding-request:${ip}`,
      ...RATE_LIMIT_PRESETS.publicForm,
    });
    if (!rl.allowed) return jsonError("Too many requests. Please try again in a minute.", 429);

    const parsedBody = await parseJsonBody(request, "POST /api/auth/onboarding-request");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;

    const parsed = onboardingRequestSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const body = parsed.data;
    const requestedDomain = body.domain.trim().toLowerCase();
    if (!isValidDomain(requestedDomain)) {
      return jsonError("Please enter a valid company domain.", 422);
    }

    if (await isPublicDomain(requestedDomain)) {
      return jsonError("Use your company domain (public email domains are not supported).", 422);
    }

    const emailDomain = extractDomain(body.workEmail);
    if (emailDomain !== requestedDomain) {
      return jsonError("Work email domain and company domain must match.", 422);
    }

    const message = [
      "SSO onboarding request from blocked login.",
      `Requested domain: ${requestedDomain}`,
      `Role/title: ${body.roleTitle}`,
      body.notes ? `Notes: ${body.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const admin = createSupabaseAdmin();
    const { error } = await admin.from("contact_submissions").insert({
      name: body.fullName,
      email: body.workEmail,
      company: body.companyName,
      type: "company",
      message,
      onboarding_domain: requestedDomain,
      onboarding_role_title: body.roleTitle,
      onboarding_status: "pending",
    });

    if (error) {
      logger.error("Onboarding request insert failed", { error: String(error), requestedDomain });
      return jsonError(
        "We could not submit your request right now. Please try again shortly.",
        500,
      );
    }

    sendContactNotification({
      name: body.fullName,
      email: body.workEmail,
      company: body.companyName,
      type: "company_onboarding_request",
      message,
    }).catch((err) => {
      logger.error("Onboarding request notification failed", {
        error: String(err),
        requestedDomain,
      });
    });

    return jsonSuccess({
      ok: true,
      message: "Request submitted. Our onboarding team will reach out soon.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to submit onboarding request", {
      route: "POST /api/auth/onboarding-request",
    });
  }
}
