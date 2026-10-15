import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  handleApiError,
  handleZodError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";

const decisionSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    comment: z.string().max(1000).optional().nullable(),
    jobId: z.string().min(1).optional(),
    candidateId: z.string().min(1).optional(),
    requestId: z.string().min(1).optional(),
    offerId: z.string().min(1).optional(),
  })
  .strict();

function taskSourceFromId(taskId: string): "shortlist" | "requisition" | "offer_finance" | null {
  if (taskId.startsWith("shortlist:")) return "shortlist";
  if (taskId.startsWith("requisition:")) return "requisition";
  if (taskId.startsWith("offer_finance:")) return "offer_finance";
  return null;
}

function entityIdFromTaskId(taskId: string): string | null {
  const idx = taskId.indexOf(":");
  if (idx < 0 || idx === taskId.length - 1) return null;
  const id = taskId.slice(idx + 1).trim();
  return id.length > 0 ? id : null;
}

async function forwardDecision(
  request: NextRequest,
  targetPath: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const cookie = request.headers.get("cookie");
  const origin = request.headers.get("origin") ?? baseUrl;
  const response = await fetch(`${baseUrl}${targetPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return new Response(text || "{}", {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}

async function forwardRequisitionDecision(
  request: NextRequest,
  requestId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const cookie = request.headers.get("cookie");
  const origin = request.headers.get("origin") ?? baseUrl;
  const response = await fetch(`${baseUrl}/api/hiring-requests/${requestId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return new Response(text || "{}", {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "hiring_manager", "recruiter", "leadership", "super_admin", "finance")) {
      return jsonError("Forbidden", 403);
    }

    const { taskId } = await params;
    const source = taskSourceFromId(taskId);
    if (!source) return jsonError("Unknown approval task", 404);
    const taskEntityId = entityIdFromTaskId(taskId);
    if (!taskEntityId) return jsonError("Invalid approval task id", 400);

    const parsedBody = await parseJsonBody(request, "POST /api/approvals/tasks/[taskId]/decision");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = decisionSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);
    const payload = parsed.data;

    if (source === "shortlist") {
      if (!payload.jobId || !payload.candidateId) {
        return jsonError("jobId and candidateId are required for shortlist approvals", 400);
      }
      return forwardDecision(request, `/api/jobs/${payload.jobId}/pipeline/approve`, {
        candidateId: payload.candidateId,
        decision: payload.decision,
        notes: payload.comment ?? null,
      });
    }

    if (source === "requisition") {
      const requestId = payload.requestId?.trim() || taskEntityId;
      return forwardRequisitionDecision(request, requestId, {
        status: payload.decision,
        comment: payload.comment ?? null,
      });
    }

    const offerId = payload.offerId?.trim() || taskEntityId;
    const offerFinanceBody: Record<string, unknown> = {
      decision: payload.decision,
    };
    if (typeof payload.comment === "string" && payload.comment.trim().length > 0) {
      offerFinanceBody.comment = payload.comment;
    }
    return forwardDecision(request, `/api/offers/${offerId}/finance`, {
      ...offerFinanceBody,
    });
  } catch (err) {
    return handleApiError(err, "Failed to apply approval decision", {
      route: "POST /api/approvals/tasks/[taskId]/decision",
    });
  }
}
