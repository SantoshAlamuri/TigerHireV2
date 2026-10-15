import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { unlockCandidateSchema } from "@/lib/validations/candidates";
import { getCompanyPlanUnlockLimit } from "@/lib/services/stripe";
import { effectiveCompanyPlan } from "@/lib/services/billing-provider";
import { consumeManualCredits, getManualBillingState } from "@/lib/services/manual-billing";
import { env } from "@/lib/config/env";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { logger } from "@/lib/observability/logger";
import { writeAccessAuditEvent } from "@/lib/security/access-audit";

const CANDIDATE_SELECT_COLUMNS = `
  id, user_id, name, full_name, email, phone, resume_url, cv_url, cv_raw_text, cv_parsed_at,
  skills, experience_years, location, intent_score, profile_embedding, visibility, signal_sources,
  trust_score, ghost_risk_score, entry_path, availability, seniority_level, current_role,
  current_company, salary_expectation_min, salary_expectation_max, referred_by, linkedin_url,
  portfolio_url, github_url, employment_status, employer_company_id, resignation_declared_at,
  profile_unlocked_at, processing_status, erased_at, last_active_at, authenticity_signal,
  authenticity_confidence, authenticity_reasons, authenticity_score, authenticity_flags, created_at, updated_at
`;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "agency")) {
      return jsonError("Forbidden", 403);
    }
    if (!ctx.organisationId) {
      return jsonError("No organisation associated with your account", 400);
    }

    const { id: candidateId } = await params;
    const parsedBody = await parseJsonBody(request, "POST /api/candidates/[id]/unlock");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = unlockCandidateSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const { jobId } = parsed.data;
    const supabase = await createSupabaseServerClient();

    // Check if already unlocked
    const { data: existing } = await supabase
      .from("candidate_unlocks")
      .select("id")
      .eq("candidate_id", candidateId)
      .eq("organisation_id", ctx.organisationId)
      .limit(1)
      .single();

    if (existing) {
      // Already unlocked — return candidate data
      const { data: candidate } = await supabase
        .from("candidates")
        .select(CANDIDATE_SELECT_COLUMNS)
        .eq("id", candidateId)
        .single();

      return jsonSuccess({ candidate, alreadyUnlocked: true });
    }

    // Check unlock quota (limits from billing_plans; platform admin can change without deploy)
    const { data: org } = await supabase
      .from("organisations")
      .select("company_plan")
      .eq("id", ctx.organisationId)
      .single();

    if (!org) return jsonError("Organisation not found", 404);

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("organisation_id", ctx.organisationId)
      .maybeSingle();

    const plan = effectiveCompanyPlan({
      plan: (org.company_plan as string) ?? "starter",
      subscriptionStatus: subscription?.status ?? null,
    });
    const monthlyLimit = await getCompanyPlanUnlockLimit(plan);

    if (monthlyLimit >= 0) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count } = await supabase
        .from("candidate_unlocks")
        .select("id", { count: "exact", head: true })
        .eq("organisation_id", ctx.organisationId)
        .gte("created_at", startOfMonth.toISOString());

      const used = count ?? 0;
      if (used >= monthlyLimit) {
        const bypassOrgIds = env.manualUnlockCapBypassOrgIds;
        const bypassAllowed = bypassOrgIds.includes(ctx.organisationId);
        if (bypassAllowed) {
          const manualState = await getManualBillingState(ctx.organisationId);
          const canUseManualWallet =
            manualState.profile.billing_mode === "manual" &&
            (manualState.wallet.unlock_balance > 0 || manualState.profile.allow_negative_balance);
          if (canUseManualWallet) {
            logger.info("Candidate unlock cap bypass granted via manual wallet override", {
              org_id: ctx.organisationId,
              plan,
              monthly_limit: monthlyLimit,
              used,
            });
          } else {
            logger.warn(
              "Candidate unlock blocked by monthly quota (bypass configured but unavailable)",
              {
                org_id: ctx.organisationId,
                plan,
                monthly_limit: monthlyLimit,
                used,
              },
            );
            return NextResponse.json(
              {
                error: `You've used all your profile unlock credits for this month (${monthlyLimit}). Upgrade your plan for more.`,
                code: "INSUFFICIENT_CREDITS",
                monthlyLimit,
                used,
              },
              { status: 403 },
            );
          }
        } else {
          logger.warn("Candidate unlock blocked by monthly quota", {
            org_id: ctx.organisationId,
            plan,
            monthly_limit: monthlyLimit,
            used,
          });
          return NextResponse.json(
            {
              error: `You've used all your profile unlock credits for this month (${monthlyLimit}). Upgrade your plan for more.`,
              code: "INSUFFICIENT_CREDITS",
              monthlyLimit,
              used,
            },
            { status: 403 },
          );
        }
      }
    }

    try {
      const creditResult = await consumeManualCredits({
        organisationId: ctx.organisationId,
        creditType: "unlock",
        amount: 1,
        reason: "Candidate unlock consumption",
        createdBy: ctx.userId,
        referenceType: "candidate_unlock",
        referenceId: candidateId,
      });
      if (creditResult.applied === true && typeof creditResult.balanceAfter === "number") {
        logger.info("Manual unlock credit consumed", {
          org_id: ctx.organisationId,
          candidate_id: candidateId,
          balance_after: creditResult.balanceAfter,
        });
      }
    } catch (creditErr) {
      const message =
        creditErr instanceof Error ? creditErr.message : "Insufficient unlock credits";
      if (message.startsWith("Insufficient")) {
        return NextResponse.json(
          {
            error: message,
            code: "INSUFFICIENT_CREDITS",
          },
          { status: 403 },
        );
      }
      throw creditErr;
    }

    // Create unlock record
    const { error: unlockError } = await supabase.from("candidate_unlocks").insert({
      candidate_id: candidateId,
      job_id: jobId,
      organisation_id: ctx.organisationId,
      unlocked_by: ctx.userId,
    });

    if (unlockError) {
      logger.error("Unlock insert failed", { error: String(unlockError) });
      return jsonError("Failed to unlock candidate", 500);
    }

    await writeAccessAuditEvent({
      userId: ctx.userId,
      candidateId,
      action: "unlock",
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: request.headers.get("user-agent"),
      metadata: { job_id: jobId, organisation_id: ctx.organisationId },
    });

    // Return full candidate data
    const { data: candidate } = await supabase
      .from("candidates")
      .select(CANDIDATE_SELECT_COLUMNS)
      .eq("id", candidateId)
      .single();

    return jsonSuccess({ candidate, alreadyUnlocked: false }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to unlock candidate", {
      route: "POST /api/candidates/[id]/unlock",
    });
  }
}
