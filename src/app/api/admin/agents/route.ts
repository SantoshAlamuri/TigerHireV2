import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { logger } from "@/lib/observability/logger";
import { processUnprocessedSignals } from "@/lib/agents/talent-scout";
import { runFitScoreBatchAgent } from "@/lib/agents/fitscore-agent";
import { triggerScoutAgent } from "@/lib/agents/scout";
import { triggerVerifyAgent } from "@/lib/agents/verify";
import { triggerSchedulerAgent } from "@/lib/agents/scheduler";
import { startVouchFlow } from "@/lib/agents/vouch";
import { captureConsentViaWhatsApp } from "@/lib/agents/consent";
import { triggerAutoReplyAgent } from "@/lib/agents/auto-reply";
import { triggerMissingInfoAgent } from "@/lib/agents/info-request";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireOrganisationEntitlement } from "@/lib/entitlements";
import { validateOrigin } from "@/lib/security/csrf";
import { isJdBaseApproved, JD_BASE_NOT_APPROVED_MESSAGE } from "@/lib/fitscore/pending-jd-approval";
import { isAdminActionAgentName } from "@/lib/agents/admin-agent-registry";
import { z } from "zod";

interface AgentActionBody {
  agent?: string;
  batchSize?: number;
  jobId?: string;
  candidateId?: string;
  maxPairs?: number;
  phone?: string;
  document_id?: string;
  session_context?: Record<string, unknown>;
  whatsapp_message_id?: string;
  stageId?: string;
  voucherPhone?: string;
  candidateName?: string;
  triggerType?: "self_cv_drop" | "referred_candidate";
  action?: "stop" | "restart";
  runId?: string;
  organisationId?: string;
}

const adminAgentActionBodySchema = z
  .object({
    agent: z.string().trim().min(1).optional(),
    batchSize: z.number().int().positive().optional(),
    jobId: z.string().trim().min(1).optional(),
    candidateId: z.string().trim().min(1).optional(),
    maxPairs: z.number().int().positive().optional(),
    phone: z.string().trim().min(1).optional(),
    document_id: z.string().trim().min(1).optional(),
    session_context: z.record(z.string(), z.unknown()).optional(),
    whatsapp_message_id: z.string().trim().min(1).optional(),
    stageId: z.string().trim().min(1).optional(),
    voucherPhone: z.string().trim().min(1).optional(),
    candidateName: z.string().trim().min(1).optional(),
    triggerType: z.enum(["self_cv_drop", "referred_candidate"]).optional(),
    action: z.enum(["stop", "restart"]).optional(),
    runId: z.string().trim().min(1).optional(),
    organisationId: z.string().trim().min(1).optional(),
  })
  .strict();

async function enforceEntitlementForExpensiveRun(body: AgentActionBody): Promise<Response | null> {
  if (body.agent !== "fitscore") return null;
  if (!body.jobId) {
    return jsonError("fitscore runs must include jobId for organisation entitlement checks", 400);
  }
  const admin = createSupabaseAdmin();
  const { data: job } = await admin
    .from("jobs")
    .select("organisation_id")
    .eq("id", body.jobId)
    .maybeSingle();
  const entitlement = await requireOrganisationEntitlement(
    (job?.organisation_id as string | null) ?? null,
    "fitscore_batch",
  );
  if (!entitlement.ok) {
    return jsonError(`Organisation not entitled for FitScore batch: ${entitlement.message}`, 403);
  }
  if (!(await isJdBaseApproved(admin, body.jobId))) {
    return jsonError(JD_BASE_NOT_APPROVED_MESSAGE, 428);
  }
  return null;
}

async function executeAgentByName(body: AgentActionBody): Promise<Response> {
  const entitlementError = await enforceEntitlementForExpensiveRun(body);
  if (entitlementError) return entitlementError;
  const agentName = body.agent;
  if (!agentName || !isAdminActionAgentName(agentName)) {
    return jsonError(`Unknown agent: ${agentName ?? "undefined"}`, 400);
  }
  switch (agentName) {
    case "talent_scout": {
      const result = await processUnprocessedSignals(body.batchSize ?? 50);
      return jsonSuccess({
        runId: result.runId,
        processed: result.recordsProcessed,
        created: result.recordsCreated,
        updated: result.recordsUpdated,
        errors: result.errors.length,
      });
    }
    case "fitscore": {
      const result = await runFitScoreBatchAgent({
        jobId: body.jobId,
        candidateId: body.candidateId,
        maxPairs: body.maxPairs ?? 100,
      });
      return jsonSuccess({
        runId: result.runId,
        processed: result.recordsProcessed,
        created: result.recordsCreated,
        errors: result.errors.length,
      });
    }
    case "scout": {
      if (!body.phone || !body.document_id) {
        return jsonError("scout requires phone and document_id", 400);
      }
      await triggerScoutAgent({
        phone: body.phone,
        document_id: body.document_id,
        session_context: body.session_context ?? {},
        whatsapp_message_id: body.whatsapp_message_id,
      });
      return jsonSuccess({ triggered: true, agent: "scout" });
    }
    case "verify": {
      if (!body.candidateId) return jsonError("verify requires candidateId", 400);
      await triggerVerifyAgent(body.candidateId);
      return jsonSuccess({ triggered: true, agent: "verify", candidateId: body.candidateId });
    }
    case "scheduler": {
      if (!body.candidateId || !body.jobId || !body.stageId) {
        return jsonError("scheduler requires candidateId, jobId, and stageId", 400);
      }
      const result = await triggerSchedulerAgent({
        candidateId: body.candidateId,
        jobId: body.jobId,
        stageId: body.stageId,
      });
      return jsonSuccess({ triggered: true, agent: "scheduler", result });
    }
    case "vouch": {
      if (!body.voucherPhone || !body.candidateId || !body.candidateName) {
        return jsonError("vouch requires voucherPhone, candidateId, and candidateName", 400);
      }
      await startVouchFlow(body.voucherPhone, body.candidateId, body.candidateName);
      return jsonSuccess({ triggered: true, agent: "vouch" });
    }
    case "consent": {
      if (!body.phone || !body.triggerType) {
        return jsonError("consent requires phone and triggerType", 400);
      }
      if (body.triggerType !== "self_cv_drop" && body.triggerType !== "referred_candidate") {
        return jsonError("consent triggerType must be self_cv_drop or referred_candidate", 400);
      }
      const supabase = createSupabaseAdmin();
      await captureConsentViaWhatsApp(supabase, body.phone, body.triggerType);
      return jsonSuccess({ triggered: true, agent: "consent" });
    }
    case "auto_reply": {
      if (!body.candidateId) return jsonError("auto_reply requires candidateId", 400);
      const result = await triggerAutoReplyAgent({
        candidateId: body.candidateId,
      });
      return jsonSuccess({ triggered: true, agent: "auto_reply", result });
    }
    case "info_request": {
      if (!body.candidateId) return jsonError("info_request requires candidateId", 400);
      const result = await triggerMissingInfoAgent(body.candidateId);
      return jsonSuccess({ triggered: true, agent: "info_request", result });
    }
  }
}

/**
 * GET /api/admin/agents — list agent run logs
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const ctx = await getAuthContext(supabase);
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const { searchParams } = request.nextUrl;
    const agentName = searchParams.get("agent");
    const status = searchParams.get("status");
    const requestedLimit = Number.parseInt(searchParams.get("limit") ?? "", 10);
    const requestedPage = Number.parseInt(searchParams.get("page") ?? "", 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 25;
    const page = Number.isFinite(requestedPage) ? Math.max(requestedPage, 1) : 1;
    const offset = (page - 1) * limit;

    let query = supabase
      .from("agent_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (agentName) {
      query = query.eq("agent_name", agentName);
    }
    if (status) {
      query = query.eq("status", status);
    }

    query = query.range(offset, offset + limit - 1);

    const { data: logs, error, count } = await query;

    if (error) {
      logger.error("Admin agents query failed", { error: String(error) });
      return jsonError("Failed to fetch agent logs", 500);
    }

    return jsonSuccess({
      logs,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch agent logs", {
      route: "GET /api/admin/agents",
    });
  }
}

/**
 * POST /api/admin/agents — trigger an agent run manually
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const { body, errorResponse } = await parseJsonBody<AgentActionBody>(
      request,
      "POST /api/admin/agents",
    );
    if (errorResponse) return errorResponse;
    const bodyParsed = adminAgentActionBodySchema.safeParse(body);
    if (!bodyParsed.success) return jsonError("Invalid request body", 422);
    return executeAgentByName(bodyParsed.data);
  } catch (err) {
    return handleApiError(err, "Failed to trigger agent", {
      route: "POST /api/admin/agents",
    });
  }
}

/**
 * PATCH /api/admin/agents — stop or restart a run
 */
export async function PATCH(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const { body, errorResponse } = await parseJsonBody<AgentActionBody>(
      request,
      "PATCH /api/admin/agents",
    );
    if (errorResponse) return errorResponse;
    const bodyParsed = adminAgentActionBodySchema.safeParse(body);
    if (!bodyParsed.success) return jsonError("Invalid request body", 422);
    const parsedBody = bodyParsed.data;
    if (!parsedBody.runId) return jsonError("runId is required", 400);
    if (!parsedBody.action || (parsedBody.action !== "stop" && parsedBody.action !== "restart")) {
      return jsonError("action must be stop or restart", 400);
    }

    const admin = createSupabaseAdmin();
    const { data: run, error: fetchError } = await admin
      .from("agent_logs")
      .select("status, payload, agent_name")
      .eq("id", parsedBody.runId)
      .single();
    if (fetchError || !run) return jsonError("Run not found", 404);

    if (parsedBody.action === "stop") {
      if (run.status !== "running") {
        return jsonError("Only running runs can be stopped", 409);
      }
      const payload = (run.payload as Record<string, unknown> | null) ?? {};
      const { error: stopError } = await admin
        .from("agent_logs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          payload: {
            ...payload,
            admin_cancelled: true,
            cancellation_reason: "Stopped manually by super admin",
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", parsedBody.runId);
      if (stopError) return jsonError("Failed to stop run", 500);
      return jsonSuccess({ stopped: true, runId: parsedBody.runId });
    }

    const payload = (run.payload as Record<string, unknown> | null) ?? {};
    const restartBody: AgentActionBody = {
      agent: run.agent_name as string,
      batchSize:
        typeof payload.batch_size === "number"
          ? payload.batch_size
          : typeof payload.batchSize === "number"
            ? payload.batchSize
            : undefined,
      jobId:
        typeof payload.job_id === "string" ? payload.job_id : (payload.jobId as string | undefined),
      candidateId:
        typeof payload.candidate_id === "string"
          ? payload.candidate_id
          : (payload.candidateId as string | undefined),
      maxPairs:
        typeof payload.max_pairs === "number"
          ? payload.max_pairs
          : typeof payload.maxPairs === "number"
            ? payload.maxPairs
            : undefined,
      phone: typeof payload.phone === "string" ? payload.phone : undefined,
      document_id: typeof payload.document_id === "string" ? payload.document_id : undefined,
      session_context:
        payload.session_context && typeof payload.session_context === "object"
          ? (payload.session_context as Record<string, unknown>)
          : undefined,
      whatsapp_message_id:
        typeof payload.whatsapp_message_id === "string" ? payload.whatsapp_message_id : undefined,
      stageId:
        typeof payload.stage_id === "string"
          ? payload.stage_id
          : (payload.stageId as string | undefined),
      voucherPhone:
        typeof payload.voucher_phone === "string"
          ? payload.voucher_phone
          : (payload.voucherPhone as string | undefined),
      candidateName:
        typeof payload.candidate_name === "string"
          ? payload.candidate_name
          : (payload.candidateName as string | undefined),
      triggerType:
        payload.trigger_type === "self_cv_drop" || payload.trigger_type === "referred_candidate"
          ? payload.trigger_type
          : payload.triggerType === "self_cv_drop" || payload.triggerType === "referred_candidate"
            ? payload.triggerType
            : undefined,
    };
    return executeAgentByName(restartBody);
  } catch (err) {
    return handleApiError(err, "Failed to process run action", {
      route: "PATCH /api/admin/agents",
    });
  }
}
