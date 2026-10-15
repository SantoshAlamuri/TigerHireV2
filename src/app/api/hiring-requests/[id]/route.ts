export const maxDuration = 60;

import { createHiringRequestSchema } from "@/lib/validations/hiring-requests";
import { NextRequest } from "next/server";
import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateJdForApprovedRequisition } from "@/lib/hiring-requests/generate-jd-from-request";
import { autoApproveRequisitionForPlatformAdmin } from "@/lib/hiring-requests/platform-admin-auto-approve";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { createNotification } from "@/lib/services/notifications";
import { logger } from "@/lib/observability/logger";
import { validateOrigin } from "@/lib/security/csrf";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { recordHiringOfferAuditEvent } from "@/lib/audit/hiring-offer-audit";
import { getRequestClientIp } from "@/lib/audit/client-ip";
import { invalidateJobCache } from "@/lib/redis/job-cache";
import { enqueueAfterResponse } from "@/lib/jobs/enqueue-after-response";
import {
  getOrgSettingsPermissions,
  resolveRequisitionApprovalWorkflowDefinitionKey,
} from "@/lib/settings/permissions";
import {
  decideRequisitionApprovalStage,
  getRequisitionWorkflowSnapshot,
  startRequisitionApprovalWorkflow,
} from "@/lib/workflows/requisition-approval-workflow";
import { validateRequisitionTransition } from "@/lib/workflows/requisition-state-machine";
import { validateHiringRequestAgainstHeadcountPlan } from "@/lib/hiring-requests/headcount-plan-validation";
import { validateHiringRequestClassificationAgainstBands } from "@/lib/hiring-requests/classification-validation";

const HIRING_REQUEST_ALL_COLUMNS =
  "id, organisation_id, created_by, title, department, headcount, urgency, description, must_haves, nice_to_haves, ideal_experience, ideal_summary, notes, status, assigned_job_id, reviewed_by, created_at, updated_at, req_code, role_level, cost_center, employment_type, location_type, location_city, headcount_type, business_justification, target_joining_date, budget_ctc_min, budget_ctc_max, submitted_at, on_hold_reason, on_hold_resume_at, template_id, headcount_plan_line_id";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "hiring_manager", "recruiter", "leadership", "super_admin", "finance")) {
      return jsonError("Forbidden", 403);
    }

    const { id } = await params;
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("hiring_requests")
      .select(HIRING_REQUEST_ALL_COLUMNS)
      .eq("id", id)
      .single();

    if (error || !data) return jsonError("Hiring request not found", 404);

    if (ctx.role === "hiring_manager" && data.created_by !== ctx.userId) {
      return jsonError("Forbidden", 403);
    }

    if (
      hasRole(ctx, "recruiter", "leadership", "finance") &&
      data.organisation_id !== ctx.organisationId
    ) {
      return jsonError("Forbidden", 403);
    }

    const admin = createSupabaseAdmin();
    const approvalWorkflow = await getRequisitionWorkflowSnapshot(admin, id, {
      profileId: ctx.userId,
      organisationId: data.organisation_id as string,
      role: ctx.role,
    });

    return jsonSuccess({ request: data, approvalWorkflow });
  } catch (err) {
    return handleApiError(err, "Failed to fetch hiring request", {
      route: "GET /api/hiring-requests/[id]",
    });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "hiring_manager", "recruiter", "leadership", "super_admin", "finance")) {
      return jsonError("Forbidden", 403);
    }

    const { id } = await params;
    const parsed = await parseJsonBody<Record<string, unknown>>(
      request,
      "PATCH /api/hiring-requests/[id]",
    );
    if (parsed.errorResponse) return parsed.errorResponse;
    let { body } = parsed;
    const supabase = await createSupabaseServerClient();

    const { data: existing, error: fetchErr } = await supabase
      .from("hiring_requests")
      .select(HIRING_REQUEST_ALL_COLUMNS)
      .eq("id", id)
      .single();

    if (fetchErr || !existing) return jsonError("Hiring request not found", 404);

    const authorDraftEdit =
      ["recruiter", "leadership"].includes(ctx.role ?? "") &&
      (body.submit === true ||
        Object.keys(body).some(
          (key) => key in createHiringRequestSchema.shape && key !== "saveDraft",
        ));
    if (authorDraftEdit) {
      if (existing.created_by !== ctx.userId || existing.organisation_id !== ctx.organisationId)
        return jsonError("Forbidden", 403);
      if (existing.status !== "draft")
        return jsonError("Only your draft requests can be edited", 409);
      if (body.status !== undefined || body.assignedJobId !== undefined)
        return jsonError("Draft edits cannot make approval decisions", 400);
      const validated = createHiringRequestSchema.partial().safeParse(body);
      if (!validated.success)
        return jsonError(validated.error.issues[0]?.message ?? "Invalid draft", 400);
      body = {
        ...Object.fromEntries(
          Object.entries(validated.data).filter(([key]) =>
            Object.prototype.hasOwnProperty.call(body, key),
          ),
        ),
        submit: body.submit === true,
      };
    }
    if (ctx.role === "hiring_manager" || authorDraftEdit) {
      if (existing.created_by !== ctx.userId) return jsonError("Forbidden", 403);
      const hmRequestedCancel = body.status === "cancelled";
      if (!hmRequestedCancel && existing.status !== "draft" && existing.status !== "submitted") {
        return jsonError("Can only edit draft or submitted requests", 400);
      }
      if (
        hmRequestedCancel &&
        !["draft", "submitted", "under_review", "on_hold", "approved"].includes(
          String(existing.status ?? ""),
        )
      ) {
        return jsonError("This requisition cannot be cancelled from its current state", 409);
      }

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      let transitionReason: string | null = null;
      if (typeof body.title === "string") updates.title = body.title;
      if (typeof body.department === "string") updates.department = body.department;
      if (typeof body.headcount === "number") updates.headcount = body.headcount;
      if (typeof body.urgency === "string") updates.urgency = body.urgency;
      if (typeof body.description === "string") updates.description = body.description;
      if (typeof body.notes === "string") updates.notes = body.notes;
      if (authorDraftEdit) {
        for (const [field, column] of Object.entries({
          department: "department",
          description: "description",
          notes: "notes",
          roleLevel: "role_level",
          costCenter: "cost_center",
          employmentType: "employment_type",
          locationType: "location_type",
          locationCity: "location_city",
          headcountType: "headcount_type",
          businessJustification: "business_justification",
          targetJoiningDate: "target_joining_date",
          budgetCtcMin: "budget_ctc_min",
          budgetCtcMax: "budget_ctc_max",
          templateId: "template_id",
        })) {
          if (body[field] === null) updates[column] = null;
        }
      }
      for (const [field, column] of Object.entries({
        mustHaves: "must_haves",
        niceToHaves: "nice_to_haves",
        idealExperience: "ideal_experience",
        idealSummary: "ideal_summary",
      })) {
        if (typeof body[field] === "string" || body[field] === null) updates[column] = body[field];
      }
      if (typeof body.roleLevel === "string") updates.role_level = body.roleLevel;
      if (typeof body.costCenter === "string") updates.cost_center = body.costCenter;
      if (typeof body.employmentType === "string") updates.employment_type = body.employmentType;
      if (typeof body.locationType === "string") updates.location_type = body.locationType;
      if (typeof body.locationCity === "string") updates.location_city = body.locationCity;
      if (typeof body.headcountType === "string") updates.headcount_type = body.headcountType;
      if (typeof body.businessJustification === "string")
        updates.business_justification = body.businessJustification;
      if (typeof body.targetJoiningDate === "string")
        updates.target_joining_date = body.targetJoiningDate;
      if (typeof body.budgetCtcMin === "number") updates.budget_ctc_min = body.budgetCtcMin;
      if (typeof body.budgetCtcMax === "number") updates.budget_ctc_max = body.budgetCtcMax;
      if (typeof body.templateId === "string") updates.template_id = body.templateId;
      if (typeof body.headcountPlanLineId === "string")
        updates.headcount_plan_line_id = body.headcountPlanLineId;

      const submitNow = body.submit === true && existing.status === "draft";
      if (submitNow) {
        const classValidation = await validateHiringRequestClassificationAgainstBands(supabase, {
          organisationId: existing.organisation_id as string,
          roleLevel:
            (typeof body.roleLevel === "string"
              ? body.roleLevel
              : updates.role_level === null
                ? null
                : (existing.role_level as string | null)) ?? null,
          budgetCtcMin:
            typeof body.budgetCtcMin === "number"
              ? body.budgetCtcMin
              : updates.budget_ctc_min === null
                ? null
                : ((existing.budget_ctc_min as number | null) ?? null),
          budgetCtcMax:
            typeof body.budgetCtcMax === "number"
              ? body.budgetCtcMax
              : updates.budget_ctc_max === null
                ? null
                : ((existing.budget_ctc_max as number | null) ?? null),
        });
        if (!classValidation.ok) return jsonError(classValidation.error, 400);

        const headcountValidation = await validateHiringRequestAgainstHeadcountPlan(supabase, {
          organisationId: existing.organisation_id as string,
          department:
            (typeof body.department === "string"
              ? body.department
              : updates.department === null
                ? null
                : (existing.department as string | null)) ?? null,
          roleLevel:
            (typeof body.roleLevel === "string"
              ? body.roleLevel
              : updates.role_level === null
                ? null
                : (existing.role_level as string | null)) ?? null,
          costCenter:
            (typeof body.costCenter === "string"
              ? body.costCenter
              : updates.cost_center === null
                ? null
                : (existing.cost_center as string | null)) ?? null,
          locationCity:
            (typeof body.locationCity === "string"
              ? body.locationCity
              : updates.location_city === null
                ? null
                : (existing.location_city as string | null)) ?? null,
          budgetCtcMin:
            typeof body.budgetCtcMin === "number"
              ? body.budgetCtcMin
              : updates.budget_ctc_min === null
                ? null
                : ((existing.budget_ctc_min as number | null) ?? null),
          budgetCtcMax:
            typeof body.budgetCtcMax === "number"
              ? body.budgetCtcMax
              : updates.budget_ctc_max === null
                ? null
                : ((existing.budget_ctc_max as number | null) ?? null),
          requestedHeadcount:
            typeof body.headcount === "number"
              ? body.headcount
              : ((existing.headcount as number | null) ?? 1),
        });
        if (!headcountValidation.ok) return jsonError(headcountValidation.error, 400);
        updates.headcount_plan_line_id = headcountValidation.lineId;

        const admin = createSupabaseAdmin();
        const dept =
          (typeof body.department === "string" ? body.department : existing.department) ?? "GEN";
        const { data: code, error: rpcError } = await admin.rpc("allocate_hiring_request_code", {
          p_org_id: existing.organisation_id as string,
          p_department: dept,
        });
        if (rpcError || typeof code !== "string" || !code) {
          logger.error("allocate_hiring_request_code failed on submit", {
            error: String(rpcError),
          });
          return jsonError("Failed to allocate requisition reference", 500);
        }
        updates.req_code = code;
        updates.status = "under_review";
        updates.submitted_at = new Date().toISOString();
      }
      if (hmRequestedCancel) {
        const cancelReason = typeof body.comment === "string" ? body.comment.trim() : "";
        transitionReason = cancelReason || null;
        updates.status = "cancelled";
      }

      const nextStatus =
        typeof updates.status === "string" ? updates.status : String(existing.status ?? "");
      if (nextStatus !== String(existing.status ?? "")) {
        const transitionCheck = validateRequisitionTransition({
          from: String(existing.status ?? ""),
          to: nextStatus,
          actorRole: ctx.role,
          reason: transitionReason,
        });
        if (!transitionCheck.ok) {
          return jsonError(transitionCheck.error, transitionCheck.status);
        }
      }

      const prevStatus = existing.status as string;
      let write = supabase.from("hiring_requests").update(updates).eq("id", id);
      if (authorDraftEdit)
        write = write
          .eq("status", "draft")
          .eq("created_by", ctx.userId)
          .eq("organisation_id", ctx.organisationId);
      const { data, error } = await write.select(HIRING_REQUEST_ALL_COLUMNS).single();

      if (error) return jsonError("Failed to update", 500);

      await recordHiringOfferAuditEvent({
        organisationId: existing.organisation_id as string,
        entityType: "hiring_request",
        entityId: id,
        eventType: submitNow ? "HIRING_REQUEST_SUBMITTED" : "HIRING_REQUEST_UPDATED",
        actorProfileId: ctx.userId,
        actorRole: ctx.role,
        prevStatus,
        newStatus: (data?.status as string) ?? prevStatus,
        ipAddress: getRequestClientIp(request),
        metadata:
          submitNow && typeof updates.req_code === "string" ? { req_code: updates.req_code } : {},
      });

      if (submitNow && ctx.isPlatformAdmin && !authorDraftEdit) {
        // Platform admins operate on behalf of the org — their submissions
        // are approved immediately instead of entering the review workflow.
        const admin = createSupabaseAdmin();
        const autoApproved = await autoApproveRequisitionForPlatformAdmin(admin, {
          hiringRequestId: id,
          organisationId: existing.organisation_id as string,
          actorProfileId: ctx.userId!,
          actorRole: ctx.role ?? null,
          ipAddress: getRequestClientIp(request),
        });
        if (autoApproved) {
          return jsonSuccess({ request: { ...data, status: "approved" } });
        }
      }

      if (submitNow) {
        try {
          const admin = createSupabaseAdmin();
          const permissions = await getOrgSettingsPermissions(
            admin,
            existing.organisation_id as string,
          );
          const definitionKey = resolveRequisitionApprovalWorkflowDefinitionKey(permissions);
          await startRequisitionApprovalWorkflow(admin, {
            organisationId: existing.organisation_id as string,
            hiringRequestId: id,
            definitionKey,
            urgency: (data?.urgency as string | null) ?? (existing.urgency as string | null),
            requestTitle: (data?.title as string | null) ?? (existing.title as string | null),
            initiatorRole: ctx.role,
          });
        } catch (workflowErr) {
          logger.warn("Failed to start requisition workflow on submit; continuing", {
            route: "PATCH /api/hiring-requests/[id]",
            hiringRequestId: id,
            error: String(workflowErr),
          });
        }

        const { data: orgMembers } = await supabase
          .from("profiles")
          .select("id")
          .eq("organisation_id", existing.organisation_id as string)
          .in("role", ["recruiter", "leadership"]);
        const title = (data?.title as string) ?? (existing.title as string);
        const reqCode = data?.req_code as string | null;
        for (const member of orgMembers ?? []) {
          await createNotification({
            userId: member.id,
            type: "hiring_request_new",
            title: `New hiring request: ${title}`,
            body: reqCode
              ? `${reqCode} — A hiring manager submitted "${title}"`
              : `A hiring manager submitted "${title}"`,
            link: `/company/hiring-requests`,
          });
        }
      }

      return jsonSuccess({ request: data });
    }

    if (hasRole(ctx, "recruiter", "leadership", "super_admin", "finance")) {
      if (existing.organisation_id !== ctx.organisationId && ctx.role !== "super_admin") {
        return jsonError("Forbidden", 403);
      }

      const prevStatus = existing.status as string;
      let transitionReason: string | null = null;
      /** Roles the requisition is waiting on after a partial (multi-stage) approval. */
      let pendingApproverRoles: string[] = [];

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        reviewed_by: ctx.userId,
      };

      if (typeof body.assignedJobId === "string") updates.assigned_job_id = body.assignedJobId;

      if (body.status === "on_hold") {
        const reason = typeof body.holdReason === "string" ? body.holdReason.trim() : "";
        const resumeRaw = typeof body.holdResumeAt === "string" ? body.holdResumeAt.trim() : "";
        if (!reason) {
          return jsonError("holdReason is required when status is on_hold", 400);
        }
        if (!resumeRaw) {
          return jsonError("holdResumeAt is required when status is on_hold", 400);
        }
        updates.status = "on_hold";
        updates.on_hold_reason = reason;
        updates.on_hold_resume_at = resumeRaw;
        transitionReason = reason;
      } else if (body.status === "approved" || body.status === "rejected") {
        const admin = createSupabaseAdmin();
        const decision = body.status === "approved" ? "approved" : "rejected";
        const decisionComment = typeof body.comment === "string" ? body.comment.trim() : "";
        if (decision === "rejected" && !decisionComment) {
          return jsonError("comment is required when rejecting a requisition", 422);
        }
        transitionReason = decisionComment || null;
        if (decision === "approved") {
          const { data: activeInstance } = await admin
            .from("workflow_instances")
            .select("id")
            .eq("subject_type", "hiring_request")
            .eq("subject_id", id)
            .eq("status", "active")
            .maybeSingle();
          if (activeInstance?.id) {
            const { data: activeStages } = await admin
              .from("workflow_stages")
              .select("approver_role")
              .eq("instance_id", activeInstance.id as string)
              .eq("status", "active");
            const approvingRoles = new Set(
              (activeStages ?? []).map((s) => String(s.approver_role ?? "")).filter(Boolean),
            );
            if (approvingRoles.has("finance")) {
              const headcountValidation = await validateHiringRequestAgainstHeadcountPlan(admin, {
                organisationId: existing.organisation_id as string,
                department: (existing.department as string | null) ?? null,
                roleLevel: (existing.role_level as string | null) ?? null,
                costCenter: (existing.cost_center as string | null) ?? null,
                locationCity: (existing.location_city as string | null) ?? null,
                budgetCtcMin: (existing.budget_ctc_min as number | null) ?? null,
                budgetCtcMax: (existing.budget_ctc_max as number | null) ?? null,
                requestedHeadcount: (existing.headcount as number | null) ?? 1,
              });
              if (!headcountValidation.ok) return jsonError(headcountValidation.error, 400);
              updates.headcount_plan_line_id = headcountValidation.lineId;
            }
          }
        }
        const workflowDecision = await decideRequisitionApprovalStage(admin, {
          hiringRequestId: id,
          actorProfileId: ctx.userId,
          decision,
          comment: decisionComment || null,
        });
        // Surface who the requisition is now waiting on. Without this, a stage-1
        // approval looks like a no-op in the UI (status stays under_review and
        // nothing says the click was recorded).
        if (workflowDecision.ok && workflowDecision.workflowStatus === "active") {
          pendingApproverRoles = workflowDecision.nextActiveRoles ?? [];
        }
        if (!workflowDecision.ok) {
          if (ctx.role === "super_admin") {
            updates.status = body.status;
          } else {
            return jsonError(workflowDecision.error, workflowDecision.status);
          }
        } else if (workflowDecision.workflowStatus === "rejected") {
          updates.status = "rejected";
        } else if (workflowDecision.workflowStatus === "completed") {
          updates.status = "approved";
          if (!existing.assigned_job_id) {
            // JD auto-generation runs a multi-second Claude call, so it happens in
            // the background (Inngest) to keep the approval confirmation instant.
            // The background job flips status "approved" → "converted" once the
            // draft JD/job is created. See generate-jd-from-request.ts.
            logger.info("Enqueuing background JD generation for approved requisition", {
              hiring_request_id: id,
            });
            if (process.env.INNGEST_EVENT_KEY) {
              enqueueAfterResponse("requisition-generate-jd", {
                hiringRequestId: id,
                actorProfileId: ctx.userId,
              });
            } else {
              // Fallback when Inngest is not configured (dev/preview without the
              // key): run generation after the response is sent, mirroring the
              // fit-score fallback in /api/applications. Without this the
              // requisition would sit at "approved" forever with no JD.
              const fallbackAdmin = createSupabaseAdmin();
              const fallbackActor = ctx.userId;
              after(async () => {
                try {
                  await generateJdForApprovedRequisition(fallbackAdmin, {
                    hiringRequestId: id,
                    actorProfileId: fallbackActor,
                  });
                } catch (err) {
                  logger.error("Auto-generate JD failed (fallback path)", {
                    hiring_request_id: id,
                    error: String(err),
                  });
                }
              });
            }
          }
        } else {
          updates.status = "under_review";
        }
      } else if (typeof body.status === "string") {
        if (body.status === "cancelled") {
          if (!hasRole(ctx, "hiring_manager", "leadership", "super_admin")) {
            return jsonError("Only hiring managers or admins can cancel requisitions", 403);
          }
          const cancelReason = typeof body.comment === "string" ? body.comment.trim() : "";
          transitionReason = cancelReason || null;
        }
        updates.status = body.status;
      }

      const nextStatus = typeof updates.status === "string" ? updates.status : prevStatus;
      if (nextStatus !== prevStatus) {
        const transitionCheck = validateRequisitionTransition({
          from: prevStatus,
          to: nextStatus,
          actorRole: ctx.role,
          reason: transitionReason,
        });
        if (!transitionCheck.ok) {
          return jsonError(transitionCheck.error, transitionCheck.status);
        }
      }

      if (updates.status != null && updates.status !== "on_hold") {
        updates.on_hold_reason = null;
        updates.on_hold_resume_at = null;
      }

      const { data, error } = await supabase
        .from("hiring_requests")
        .update(updates)
        .eq("id", id)
        .select(HIRING_REQUEST_ALL_COLUMNS)
        .single();

      if (error) {
        logger.error("Failed to update", { error: String(error) });
        return jsonError("Failed to update", 500);
      }

      const orgId = existing.organisation_id as string;
      const prevJid = existing.assigned_job_id as string | null;
      const nextJid = (data?.assigned_job_id as string | null) ?? null;
      if (prevJid && prevJid !== nextJid) {
        const { error: clearErr } = await supabase
          .from("jobs")
          .update({ hiring_request_id: null })
          .eq("id", prevJid)
          .eq("hiring_request_id", id);
        if (clearErr) {
          logger.warn("Could not clear hiring_request_id on previous job", {
            job_id: prevJid,
            error: String(clearErr),
          });
        }
        await invalidateJobCache(prevJid, orgId);
      }
      if (nextJid) {
        const { error: linkErr } = await supabase
          .from("jobs")
          .update({ hiring_request_id: id })
          .eq("id", nextJid);
        if (linkErr) {
          logger.warn("Could not set hiring_request_id on job", {
            job_id: nextJid,
            error: String(linkErr),
          });
        }
        await invalidateJobCache(nextJid, orgId);
      }

      const resolvedStatus = (data?.status as string) ?? prevStatus;
      let recruiterEventType = "HIRING_REQUEST_RECRUITER_UPDATE";
      if (body.status === "on_hold") recruiterEventType = "HIRING_REQUEST_ON_HOLD";
      else if (body.status === "rejected") recruiterEventType = "HIRING_REQUEST_REJECTED";
      else if (
        body.status === "approved" &&
        (resolvedStatus === "approved" || resolvedStatus === "converted")
      ) {
        recruiterEventType = "HIRING_REQUEST_APPROVED";
      }

      const holdReasonForAudit =
        body.status === "on_hold" && typeof body.holdReason === "string"
          ? body.holdReason.trim()
          : null;

      await recordHiringOfferAuditEvent({
        organisationId: existing.organisation_id as string,
        entityType: "hiring_request",
        entityId: id,
        eventType: recruiterEventType,
        actorProfileId: ctx.userId,
        actorRole: ctx.role,
        prevStatus,
        newStatus: (data?.status as string) ?? prevStatus,
        ipAddress: getRequestClientIp(request),
        comments: holdReasonForAudit,
        metadata:
          body.status === "on_hold"
            ? {
                hold_resume_at: data?.on_hold_resume_at ?? updates.on_hold_resume_at,
              }
            : { patch: Object.keys(body) },
      });

      const notifBody =
        body.status === "on_hold"
          ? `Your hiring request is on hold. Review is expected to resume on ${String(data?.on_hold_resume_at ?? "")}.`
          : body.status === "approved"
            ? "Your hiring request has been approved. A JD is being prepared."
            : body.status === "converted"
              ? "Your hiring request has been converted into a JD."
              : body.status === "rejected"
                ? "Your hiring request was not approved."
                : "Your hiring request has been updated.";

      const ok = await createNotification({
        userId: existing.created_by,
        type: "hiring_request_new",
        title: `Hiring request "${existing.title}" ${body.status ?? "updated"}`,
        body: notifBody,
        link: `/company/hiring-requests`,
      });
      if (!ok) {
        logger.warn("createNotification failed", {
          route: "PATCH /api/hiring-requests/[id]",
          userId: existing.created_by,
        });
      }

      return jsonSuccess({
        request: data,
        generatedJob: null,
        ...(pendingApproverRoles.length > 0 ? { pendingApproverRoles } : {}),
      });
    }

    return jsonError("Forbidden", 403);
  } catch (err) {
    return handleApiError(err, "Failed to update hiring request", {
      route: "PATCH /api/hiring-requests/[id]",
    });
  }
}
