import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
import { createHiringRequestSchema } from "@/lib/validations/hiring-requests";
import { createNotification } from "@/lib/services/notifications";
import { logger } from "@/lib/observability/logger";
import { validateOrigin } from "@/lib/security/csrf";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { recordHiringOfferAuditEvent } from "@/lib/audit/hiring-offer-audit";
import { getRequestClientIp } from "@/lib/audit/client-ip";
import {
  getOrgSettingsPermissions,
  resolveRequisitionApprovalWorkflowDefinitionKey,
} from "@/lib/settings/permissions";
import { startRequisitionApprovalWorkflow } from "@/lib/workflows/requisition-approval-workflow";
import { autoApproveRequisitionForPlatformAdmin } from "@/lib/hiring-requests/platform-admin-auto-approve";
import { validateHiringRequestAgainstHeadcountPlan } from "@/lib/hiring-requests/headcount-plan-validation";
import { validateHiringRequestClassificationAgainstBands } from "@/lib/hiring-requests/classification-validation";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_OFFSET = 10_000;
const HIRING_REQUEST_CREATOR_ROLES = [
  "hiring_manager",
  "recruiter",
  "leadership",
  "super_admin",
] as const;

const HIRING_REQUEST_ALL_COLUMNS =
  "id, organisation_id, created_by, title, department, headcount, urgency, description, must_haves, nice_to_haves, ideal_experience, ideal_summary, notes, status, assigned_job_id, reviewed_by, created_at, updated_at, req_code, role_level, cost_center, employment_type, location_type, location_city, headcount_type, business_justification, target_joining_date, budget_ctc_min, budget_ctc_max, submitted_at, on_hold_reason, on_hold_resume_at, template_id, headcount_plan_line_id";

function parsePaginationParams(url: URL) {
  const rawLimit = url.searchParams.get("limit");
  const rawOffset = url.searchParams.get("offset");

  const limit = rawLimit === null ? DEFAULT_LIMIT : Number.parseInt(rawLimit, 10);
  const offset = rawOffset === null ? 0 : Number.parseInt(rawOffset, 10);

  if (!Number.isInteger(limit) || limit < 1) {
    return { error: "Invalid limit: expected an integer >= 1" as const };
  }
  if (!Number.isInteger(offset) || offset < 0) {
    return { error: "Invalid offset: expected an integer >= 0" as const };
  }

  return {
    limit: Math.min(limit, MAX_LIMIT),
    offset: Math.min(offset, MAX_OFFSET),
  };
}

function requesterRoleLabel(role: string): string {
  if (role === "hiring_manager") return "hiring manager";
  if (role === "recruiter") return "recruiter";
  if (role === "leadership") return "company admin";
  if (role === "super_admin") return "super admin";
  return "team member";
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!hasRole(ctx, "hiring_manager", "recruiter", "leadership", "super_admin", "finance")) {
      return jsonError("Forbidden", 403);
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const pagination = parsePaginationParams(url);
    if ("error" in pagination) {
      return jsonError(String(pagination.error), 400);
    }
    const { limit, offset } = pagination;

    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from("hiring_requests")
      .select(HIRING_REQUEST_ALL_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (ctx.role === "hiring_manager") {
      query = query.eq("created_by", ctx.userId);
    } else if (ctx.organisationId) {
      query = query.eq("organisation_id", ctx.organisationId);
    }

    if (status) {
      if (status === "pending") {
        query = query.in("status", ["pending", "submitted", "under_review"]);
      } else {
        query = query.eq("status", status);
      }
    }

    if (hasRole(ctx, "recruiter", "leadership", "finance") && ctx.role !== "super_admin") {
      // Hide other people's drafts from reviewers, but never the requester's
      // own: a recruiter/company-admin who saves a requisition as draft must
      // still see it in their list, or it appears to vanish mid-flow.
      query = query.or(`status.neq.draft,created_by.eq.${ctx.userId}`);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error("Failed to fetch hiring requests", {
        error: JSON.stringify(error),
      });
      return jsonError("Failed to fetch hiring requests", 500);
    }

    const rows = data ?? [];
    const creatorIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))];

    let profileMap: Record<string, string> = {};
    if (creatorIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", creatorIds);
      if (profilesError) {
        logger.error("Failed to fetch creator profiles for hiring requests", {
          error: JSON.stringify(profilesError),
        });
        return jsonError("Failed to fetch hiring requests", 500);
      }
      if (profiles) {
        profileMap = Object.fromEntries(
          profiles.map((p: { id: string; full_name: string | null }) => [p.id, p.full_name ?? ""]),
        );
      }
    }

    const requests = rows.map((r: Record<string, unknown>) => ({
      ...r,
      created_by_name: profileMap[r.created_by as string] || null,
    }));

    const total = count ?? 0;
    return jsonSuccess({
      requests,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + rows.length < total,
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch hiring requests", {
      route: "GET /api/hiring-requests",
    });
  }
}

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!hasRole(ctx, ...HIRING_REQUEST_CREATOR_ROLES)) {
      return jsonError("You are not allowed to create hiring requests", 403);
    }

    if (!ctx.organisationId) {
      return jsonError("No organisation associated", 400);
    }

    const parsedBody = await parseJsonBody(request, "POST /api/hiring-requests");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = createHiringRequestSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const d = parsed.data;
    // Any allowed creator role can explicitly choose draft mode.
    const saveDraft = d.saveDraft === true;

    const supabase = await createSupabaseServerClient();

    let reqCode: string | null = null;
    let submittedAt: string | null = null;
    const status = saveDraft ? "draft" : "under_review";

    let resolvedHeadcountPlanLineId: string | null = d.headcountPlanLineId ?? null;
    if (!saveDraft) {
      const classValidation = await validateHiringRequestClassificationAgainstBands(supabase, {
        organisationId: ctx.organisationId,
        roleLevel: d.roleLevel ?? null,
        budgetCtcMin: d.budgetCtcMin ?? null,
        budgetCtcMax: d.budgetCtcMax ?? null,
      });
      if (!classValidation.ok) return jsonError(classValidation.error, 400);

      const headcountValidation = await validateHiringRequestAgainstHeadcountPlan(supabase, {
        organisationId: ctx.organisationId,
        department: d.department ?? null,
        roleLevel: d.roleLevel ?? null,
        costCenter: d.costCenter ?? null,
        locationCity: d.locationCity ?? null,
        budgetCtcMin: d.budgetCtcMin ?? null,
        budgetCtcMax: d.budgetCtcMax ?? null,
        requestedHeadcount: d.headcount,
      });
      if (!headcountValidation.ok) {
        return jsonError(headcountValidation.error, 400);
      }
      resolvedHeadcountPlanLineId = headcountValidation.lineId;

      const admin = createSupabaseAdmin();
      const { data: code, error: rpcError } = await admin.rpc("allocate_hiring_request_code", {
        p_org_id: ctx.organisationId,
        p_department: d.department ?? "GEN",
      });
      if (rpcError || typeof code !== "string" || !code) {
        logger.error("allocate_hiring_request_code failed", { error: String(rpcError) });
        return jsonError("Failed to allocate requisition reference", 500);
      }
      reqCode = code;
      submittedAt = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("hiring_requests")
      .insert({
        organisation_id: ctx.organisationId,
        created_by: ctx.userId,
        title: d.title,
        department: d.department ?? null,
        headcount: d.headcount,
        urgency: d.urgency,
        description: d.description ?? null,
        must_haves: d.mustHaves ?? null,
        nice_to_haves: d.niceToHaves ?? null,
        ideal_experience: d.idealExperience ?? null,
        ideal_summary: d.idealSummary ?? null,
        notes: d.notes ?? null,
        status,
        req_code: reqCode,
        submitted_at: submittedAt,
        role_level: d.roleLevel ?? null,
        cost_center: d.costCenter ?? null,
        employment_type: d.employmentType ?? null,
        location_type: d.locationType ?? null,
        location_city: d.locationCity ?? null,
        headcount_type: d.headcountType ?? null,
        business_justification: d.businessJustification ?? null,
        target_joining_date: d.targetJoiningDate ?? null,
        budget_ctc_min: d.budgetCtcMin ?? null,
        budget_ctc_max: d.budgetCtcMax ?? null,
        template_id: d.templateId ?? null,
        headcount_plan_line_id: resolvedHeadcountPlanLineId,
      })
      .select(HIRING_REQUEST_ALL_COLUMNS)
      .single();

    if (error) {
      logger.error("Failed to create hiring request", { error: String(error) });
      return jsonError("Failed to create hiring request", 500);
    }

    await recordHiringOfferAuditEvent({
      organisationId: ctx.organisationId!,
      entityType: "hiring_request",
      entityId: data.id as string,
      eventType: saveDraft ? "HIRING_REQUEST_DRAFT_CREATED" : "HIRING_REQUEST_SUBMITTED",
      actorProfileId: ctx.userId,
      actorRole: ctx.role,
      prevStatus: null,
      newStatus: status,
      ipAddress: getRequestClientIp(request),
      metadata: reqCode ? { req_code: reqCode } : {},
    });

    // Platform admins operate on behalf of the org — their submissions are
    // approved immediately instead of entering the review workflow.
    if (!saveDraft && ctx.isPlatformAdmin) {
      const admin = createSupabaseAdmin();
      const autoApproved = await autoApproveRequisitionForPlatformAdmin(admin, {
        hiringRequestId: data.id as string,
        organisationId: ctx.organisationId,
        actorProfileId: ctx.userId!,
        actorRole: ctx.role ?? null,
        ipAddress: getRequestClientIp(request),
      });
      if (autoApproved) {
        return jsonSuccess({ request: { ...data, status: "approved" } }, 201);
      }
    }

    // Notify recruiters and admins when submitted (not draft)
    if (!saveDraft) {
      try {
        const admin = createSupabaseAdmin();
        const permissions = await getOrgSettingsPermissions(admin, ctx.organisationId);
        const definitionKey = resolveRequisitionApprovalWorkflowDefinitionKey(permissions);
        await startRequisitionApprovalWorkflow(admin, {
          organisationId: ctx.organisationId,
          hiringRequestId: data.id as string,
          definitionKey,
          urgency: d.urgency,
          requestTitle: d.title,
          initiatorRole: ctx.role,
        });
      } catch (workflowErr) {
        logger.warn("Failed to start requisition workflow; continuing create flow", {
          route: "POST /api/hiring-requests",
          error: String(workflowErr),
          hiringRequestId: data.id,
        });
      }

      const { data: orgMembers } = await supabase
        .from("profiles")
        .select("id")
        .eq("organisation_id", ctx.organisationId)
        .in("role", ["recruiter", "leadership"]);

      if (orgMembers && orgMembers.length > 0) {
        try {
          const requesterRole = requesterRoleLabel(ctx.role);
          for (const member of orgMembers) {
            const ok = await createNotification({
              userId: member.id,
              type: "hiring_request_new",
              title: `New hiring request: ${d.title.trim()}`,
              body: reqCode
                ? `${reqCode} — A ${requesterRole} has requested to hire for "${d.title.trim()}"`
                : `A ${requesterRole} has requested to hire for "${d.title.trim()}"`,
              link: `/company/hiring-requests`,
            });
            if (!ok) {
              logger.warn("createNotification failed", {
                route: "POST /api/hiring-requests",
                userId: member.id,
              });
            }
          }
        } catch (notifyErr) {
          logger.error("Failed to send notifications for hiring request", {
            hiringRequestId: data.id,
            error: String(notifyErr),
          });
        }
      }
    }

    return jsonSuccess({ request: data }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to create hiring request", {
      route: "POST /api/hiring-requests",
    });
  }
}
