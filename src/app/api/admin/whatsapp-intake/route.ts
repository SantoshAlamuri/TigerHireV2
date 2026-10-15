import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { processIntakeItem } from "@/lib/whatsapp/intake-inbox";
import { validateOrigin } from "@/lib/security/csrf";

/**
 * Super-admin inbox for partner-forwarded resumes (Apna → dedicated WhatsApp
 * intake number). GET lists items + open jobs for assignment; POST assigns a job
 * and pushes the file through the standard intake pipeline, retries, or ignores.
 */

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const admin = createSupabaseAdmin();
    const [{ data: items, error: itemsError }, { data: jobs, error: jobsError }] =
      await Promise.all([
        admin
          .from("whatsapp_intake_items")
          .select(
            "id, source, sender_phone, filename, mime_type, caption, status, error, job_id, candidate_id, processed_at, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(200),
        admin
          .from("jobs")
          .select("id, title, organisations!jobs_organisation_id_fkey(name)")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
    if (itemsError) throw itemsError;
    if (jobsError) throw jobsError;

    return jsonSuccess({
      items: items ?? [],
      jobs: (jobs ?? []).map((j) => {
        const orgRaw = (j as { organisations?: { name?: string } | { name?: string }[] | null })
          .organisations;
        const org = Array.isArray(orgRaw) ? orgRaw[0] : orgRaw;
        return {
          id: j.id as string,
          title: (j.title as string) ?? "Untitled",
          org: org?.name ?? "",
        };
      }),
    });
  } catch (err) {
    return handleApiError(err, "Failed to load WhatsApp intake inbox", {
      route: "GET /api/admin/whatsapp-intake",
    });
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign_and_process"),
    itemId: z.string().uuid(),
    jobId: z.string().uuid(),
  }),
  z.object({ action: z.literal("retry"), itemId: z.string().uuid() }),
  z.object({ action: z.literal("ignore"), itemId: z.string().uuid() }),
]);

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Invalid request body", 422);
    const body = parsed.data;

    const admin = createSupabaseAdmin();

    if (body.action === "ignore") {
      const { error } = await admin
        .from("whatsapp_intake_items")
        .update({ status: "ignored", updated_at: new Date().toISOString() })
        .eq("id", body.itemId)
        .neq("status", "processed");
      if (error) throw error;
      return jsonSuccess({ status: "ignored" });
    }

    let jobId: string;
    if (body.action === "assign_and_process") {
      jobId = body.jobId;
    } else {
      const { data: item } = await admin
        .from("whatsapp_intake_items")
        .select("job_id")
        .eq("id", body.itemId)
        .maybeSingle<{ job_id: string | null }>();
      if (!item?.job_id) return jsonError("Item has no job assigned; assign one first.", 422);
      jobId = item.job_id;
    }

    const result = await processIntakeItem({ admin, itemId: body.itemId, jobId });
    if (!result.ok) return jsonError(result.error ?? "Processing failed", 502);
    return jsonSuccess({ status: "processed" });
  } catch (err) {
    return handleApiError(err, "WhatsApp intake action failed", {
      route: "POST /api/admin/whatsapp-intake",
    });
  }
}
