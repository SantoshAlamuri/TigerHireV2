import { NextRequest } from "next/server";
import { z } from "zod";
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
import { assertJobAccess } from "@/lib/job-access";
import { validateOrigin } from "@/lib/security/csrf";
import { createJobScreeningQuestionSchema } from "@/lib/validations/job-screening-questions";
import { parseScreeningOptions } from "@/lib/screening/job-screening";

const READER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "hiring_manager",
  "finance",
  "agency",
] as const;

const WRITER_ROLES = ["super_admin", "leadership", "recruiter"] as const;

const rowSchema = z.object({
  id: z.string().uuid(),
  job_id: z.string().uuid(),
  question_text: z.string(),
  fail_on_yes: z.boolean(),
  sort_order: z.number(),
  is_active: z.boolean(),
  answer_type: z.string().nullish(),
  options: z.unknown().nullish(),
  created_at: z.string(),
  updated_at: z.string().nullish().optional(),
});

type Row = z.infer<typeof rowSchema>;

function mapRow(r: Row) {
  const answerType = r.answer_type === "single_select" ? "single_select" : "yes_no";
  return {
    id: r.id,
    jobId: r.job_id,
    questionText: r.question_text,
    failOnYes: r.fail_on_yes,
    sortOrder: r.sort_order,
    isActive: r.is_active,
    answerType,
    options: answerType === "single_select" ? parseScreeningOptions(r.options) : null,
    createdAt: r.created_at,
  };
}

const SCREENING_SELECT =
  "id, job_id, question_text, fail_on_yes, sort_order, is_active, answer_type, options, created_at, updated_at";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...READER_ROLES)) return jsonError("Forbidden", 403);

    const { id: jobId } = await params;
    const supabase = await createSupabaseServerClient();
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found", 404);

    const { data, error } = await supabase
      .from("job_screening_questions")
      .select(SCREENING_SELECT)
      .eq("job_id", jobId)
      .order("sort_order", { ascending: true });

    if (error) throw error;

    const rows = (data ?? [])
      .map((r) => rowSchema.safeParse(r))
      .filter((x): x is { success: true; data: Row } => x.success)
      .map((x) => mapRow(x.data));

    return jsonSuccess({ questions: rows });
  } catch (err) {
    return handleApiError(err, "Failed to list screening questions", {
      route: "GET /api/jobs/[id]/screening-questions",
    });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...WRITER_ROLES)) return jsonError("Forbidden", 403);

    const { id: jobId } = await params;
    const supabase = await createSupabaseServerClient();
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found", 404);

    const body = await parseJsonBody(request, "POST /api/jobs/.../screening-questions");
    if (body.errorResponse) return body.errorResponse;
    const parsed = createJobScreeningQuestionSchema.safeParse(body.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const p = parsed.data;
    const { data, error } = await supabase
      .from("job_screening_questions")
      .insert({
        organisation_id: job.organisation_id,
        job_id: jobId,
        question_text: p.questionText,
        fail_on_yes: p.failOnYes,
        sort_order: p.sortOrder ?? 0,
        is_active: p.isActive,
        answer_type: p.answerType,
        options: p.answerType === "single_select" ? (p.options ?? null) : null,
      })
      .select(SCREENING_SELECT)
      .single();

    if (error) throw error;
    const row = rowSchema.parse(data);
    return jsonSuccess({ question: mapRow(row) }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to add screening question", {
      route: "POST /api/jobs/[id]/screening-questions",
    });
  }
}
