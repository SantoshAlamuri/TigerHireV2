import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
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
import { validateChain, describeChain } from "@/lib/workflows/requisition-chain";
import { ROLE_LABELS } from "@/types/database";

/**
 * The organisation's requisition approval policy.
 *
 * Readable by anyone in the org — a hiring manager should be able to see who
 * will approve their requisition before they raise it. Writable only by the
 * people who set company policy.
 */
const stepSchema = z.object({
  stepOrder: z.number().int().min(1).max(20),
  approverRole: z.enum(["recruiter", "leadership", "finance", "hiring_manager"]),
  slaHours: z.number().int().min(1).max(720),
  skipWhenRaiserRole: z
    .array(z.enum(["recruiter", "leadership", "finance", "hiring_manager"]))
    .max(4)
    .default([]),
  skipWhenBudgetBelow: z.number().positive().nullable().default(null),
});

const chainSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).nullable().optional(),
  steps: z.array(stepSchema).max(20),
});

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation associated with your account", 400);
    // Agencies are external; how a client approves its own requisitions is
    // none of their business.
    if (!hasRole(ctx, "recruiter", "leadership", "hiring_manager", "finance", "super_admin")) {
      return jsonError("Forbidden", 403);
    }

    const admin = createSupabaseAdmin();
    const { data: chain } = await admin
      .from("requisition_approval_chains")
      .select("id, name, description, is_default")
      .eq("organisation_id", ctx.organisationId)
      .eq("is_default", true)
      .maybeSingle();

    if (!chain?.id) {
      // No chain authored — the org runs on a preset. Say so rather than
      // returning an empty chain, which reads as "approves everything".
      return jsonSuccess({ chain: null, usingPreset: true, summary: null });
    }

    const { data: steps } = await admin
      .from("requisition_approval_chain_steps")
      .select("step_order, approver_role, sla_hours, skip_when_raiser_role, skip_when_budget_below")
      .eq("chain_id", chain.id as string)
      .order("step_order", { ascending: true });

    const mapped = (steps ?? []).map((s) => ({
      stepOrder: Number(s.step_order),
      approverRole: String(s.approver_role),
      slaHours: Number(s.sla_hours ?? 8),
      skipWhenRaiserRole: (s.skip_when_raiser_role as string[] | null) ?? [],
      skipWhenBudgetBelow:
        s.skip_when_budget_below == null ? null : Number(s.skip_when_budget_below),
    }));

    return jsonSuccess({
      chain: { ...chain, steps: mapped },
      usingPreset: false,
      summary: describeChain(
        { id: chain.id as string, name: String(chain.name), steps: mapped },
        ROLE_LABELS,
      ),
    });
  } catch (err) {
    return handleApiError(err, "Failed to load the approval chain", {
      route: "GET /api/settings/requisition-chains",
    });
  }
}

export async function PUT(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation associated with your account", 400);
    // Who approves a requisition is company policy, not desk configuration.
    if (!hasRole(ctx, "leadership", "super_admin")) {
      return jsonError("Only a company admin can change the approval policy", 403);
    }

    const { body, errorResponse } = await parseJsonBody(
      request,
      "PUT /api/settings/requisition-chains",
    );
    if (errorResponse) return errorResponse;
    const parsed = chainSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const admin = createSupabaseAdmin();

    // Refuse a chain that routes to a role nobody in the org holds — otherwise
    // the requisition waits forever on an approver who does not exist, which is
    // the exact failure the shipped presets caused.
    const { data: profiles } = await admin
      .from("profiles")
      .select("role")
      .eq("organisation_id", ctx.organisationId)
      .eq("account_status", "active");
    const rolesPresent = [...new Set((profiles ?? []).map((p) => String(p.role)))];

    const check = validateChain(
      { id: "new", name: parsed.data.name, steps: parsed.data.steps },
      rolesPresent,
    );
    if (!check.ok) {
      return jsonError(check.problems.join(" "), 422);
    }

    const { data: existing } = await admin
      .from("requisition_approval_chains")
      .select("id")
      .eq("organisation_id", ctx.organisationId)
      .eq("is_default", true)
      .maybeSingle();

    let chainId = existing?.id as string | undefined;
    if (chainId) {
      await admin
        .from("requisition_approval_chains")
        .update({
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", chainId);
      // Steps are replaced wholesale: a partial update would leave a step the
      // author deleted still gating requisitions.
      await admin.from("requisition_approval_chain_steps").delete().eq("chain_id", chainId);
    } else {
      const { data: created, error } = await admin
        .from("requisition_approval_chains")
        .insert({
          organisation_id: ctx.organisationId,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          is_default: true,
          created_by: ctx.userId,
        })
        .select("id")
        .single();
      if (error || !created?.id) return jsonError("Failed to save the approval chain", 500);
      chainId = created.id as string;
    }

    if (parsed.data.steps.length > 0) {
      const { error: stepsError } = await admin.from("requisition_approval_chain_steps").insert(
        parsed.data.steps.map((s) => ({
          chain_id: chainId,
          step_order: s.stepOrder,
          approver_role: s.approverRole,
          sla_hours: s.slaHours,
          skip_when_raiser_role: s.skipWhenRaiserRole,
          skip_when_budget_below: s.skipWhenBudgetBelow,
        })),
      );
      if (stepsError) {
        logger.error("Failed to save requisition chain steps", {
          organisationId: ctx.organisationId,
          chainId,
          error: stepsError.message,
        });
        return jsonError("Failed to save the approval steps", 500);
      }
    }

    // Requisitions already in flight keep the plan they started with — editing
    // policy must not rewrite a decision that is half-made.
    logger.info("Requisition approval chain saved", {
      organisationId: ctx.organisationId,
      chainId,
      steps: parsed.data.steps.length,
      changedBy: ctx.userId,
    });

    return jsonSuccess({
      chainId,
      summary: describeChain(
        { id: chainId!, name: parsed.data.name, steps: parsed.data.steps },
        ROLE_LABELS,
      ),
    });
  } catch (err) {
    return handleApiError(err, "Failed to save the approval chain", {
      route: "PUT /api/settings/requisition-chains",
    });
  }
}
