import { NextRequest } from "next/server";
import { z } from "zod";
import {
  handleApiError,
  handleZodError,
  jsonError,
  jsonSuccess,
  parseJsonBody,
} from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSettingsAdmin } from "@/lib/settings/server";
import { validateOrigin } from "@/lib/security/csrf";
import {
  createHrisSyncRun,
  completeHrisSyncRun,
  listHrisSyncRuns,
} from "@/lib/repositories/hris-sync-runs.repository";
import { runHrisSyncSchema, listHrisSyncRunsSchema } from "@/lib/validations/hris-sync";
import { writeAuditLog } from "@/lib/repositories/integrations.repository";
import { executeHrisSync } from "@/lib/integrations/hris/sync";
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";

const listQuerySchema = z
  .object({
    provider: z.string().optional(),
    limit: z.string().optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSettingsAdmin(request, { capability: "manage_integrations" });
    if (auth.error) return auth.error;

    const queryObject = Object.fromEntries(new URL(request.url).searchParams.entries());
    const parsedQuery = listQuerySchema.safeParse(queryObject);
    if (!parsedQuery.success) return handleZodError(parsedQuery.error);

    const normalizedQuery = listHrisSyncRunsSchema.safeParse(parsedQuery.data);
    if (!normalizedQuery.success) return handleZodError(normalizedQuery.error);

    const supabase = await createSupabaseServerClient();
    const runs = await listHrisSyncRuns(supabase, {
      organisationId: auth.context.organisationId,
      provider: normalizedQuery.data.provider,
      limit: normalizedQuery.data.limit,
    });

    return jsonSuccess({ runs });
  } catch (err) {
    return handleApiError(err, "Failed to list HRIS sync runs", {
      route: "GET /api/settings/org/integrations/hris/sync",
    });
  }
}

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  let runId: string | null = null;
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> | null = null;

  try {
    const auth = await requireSettingsAdmin(request, {
      validateCsrf: true,
      capability: "manage_integrations",
    });
    if (auth.error) return auth.error;

    const limiter = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "hris-sync-run",
        organisationId: auth.context.organisationId,
        userId: auth.context.userId,
      }),
      limit: 4,
      windowSecs: 60,
    });
    if (!limiter.allowed) return jsonError("Too many sync attempts. Try again in a minute.", 429);

    const { body, errorResponse } = await parseJsonBody(
      request,
      "POST /api/settings/org/integrations/hris/sync",
    );
    if (errorResponse) return errorResponse;
    const parsed = runHrisSyncSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    supabase = await createSupabaseServerClient();

    const run = await createHrisSyncRun(supabase, {
      organisationId: auth.context.organisationId,
      provider: parsed.data.provider,
      mode: parsed.data.mode,
      triggeredBy: auth.context.userId,
      summary: {
        phase: "phase_1",
        note: "Connectivity + reconciliation gap report",
      },
    });
    runId = run.id;

    const summary = await executeHrisSync({
      supabase,
      organisationId: auth.context.organisationId,
      provider: parsed.data.provider,
      mode: parsed.data.mode,
    });

    const completed = await completeHrisSyncRun(supabase, {
      id: run.id,
      status: summary.connectivity.ok ? "succeeded" : "failed",
      summary,
      errorMessage: summary.connectivity.ok ? null : summary.connectivity.message,
    });

    await writeAuditLog(supabase, {
      organisation_id: auth.context.organisationId,
      actor_user_id: auth.context.userId,
      actor_email: auth.context.actorEmail,
      event_type: "integration.hris_sync_run",
      resource_type: "hris_sync_run",
      resource_id: completed.id,
      metadata: {
        provider: completed.provider,
        mode: completed.mode,
        status: completed.status,
      },
      ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
    });

    return jsonSuccess({ run: completed }, 201);
  } catch (err) {
    if (runId && supabase) {
      try {
        await completeHrisSyncRun(supabase, {
          id: runId,
          status: "failed",
          summary: {
            phase: "phase_1",
            error: err instanceof Error ? err.message : "Unknown error",
          },
          errorMessage: err instanceof Error ? err.message : "Unknown error",
        });
      } catch {
        // Intentionally swallow secondary persistence failures.
      }
    }

    return handleApiError(err, "Failed to run HRIS sync", {
      route: "POST /api/settings/org/integrations/hris/sync",
    });
  }
}
