import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthContext, requireAuth, hasRole, jsonError } from "@/lib/api-helpers";
import { listHiringManagerJobIds } from "@/lib/jobs/hiring-manager-job-ids";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/observability/logger";
import { writeAccessAuditBatch } from "@/lib/security/access-audit";
import { toCsv } from "@/lib/csv/to-csv";

const ALLOWED_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

/**
 * `referral_payouts` was retired on 2026-08-01. It returned every *pending*
 * payout with the referrer's UPI id, on the old model where the company's
 * finance team paid from that file. Two things made it unsafe once TigerHire
 * became the payer: nothing ever advanced a row past 'pending', so each download
 * returned the same rows again and invited a second payment; and payee bank
 * details are no longer the company's to hold.
 *
 * Its replacement is GET /api/referrals/statement — settled payments only, with
 * the job and payment reference, and no payee details.
 */
const EXPORT_TYPES = ["candidates", "applications", "pipeline"] as const;
type ExportType = (typeof EXPORT_TYPES)[number];

type ExportAudit = {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  organisationId?: string | null;
};

/** Pull unique candidate ids out of exported rows' nested `candidates` relation. */
function collectCandidateIds(rows: unknown): string[] {
  const list = (rows ?? []) as Array<Record<string, unknown>>;
  const ids = new Set<string>();
  for (const row of list) {
    const candidate = row.candidates as
      | Record<string, unknown>
      | Array<Record<string, unknown>>
      | null;
    if (!candidate) continue;
    const entries = Array.isArray(candidate) ? candidate : [candidate];
    for (const c of entries) {
      const id = c?.id;
      if (typeof id === "string" && id) ids.add(id);
    }
  }
  return [...ids];
}

/** Write a `view_pii` access-audit batch for an applications/pipeline export. */
async function writeExportAccessAudit(
  audit: ExportAudit,
  exportType: "applications" | "pipeline",
  isSuperAdmin: boolean,
  candidateIds: string[],
): Promise<void> {
  await writeAccessAuditBatch(
    audit.userId,
    candidateIds,
    "view_pii",
    {
      route: "GET /api/export",
      export_type: exportType,
      organisation_id: audit.organisationId ?? null,
      scope: isSuperAdmin ? "super_admin" : "organisation",
    },
    audit.ipAddress,
    audit.userAgent,
  );
}

// ---------------------------------------------------------------------------
// Candidates export
// ---------------------------------------------------------------------------
async function exportCandidates(
  orgId: string | null,
  isSuperAdmin: boolean,
  hmJobIds: string[] | null,
  audit?: {
    userId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    organisationId?: string | null;
  },
) {
  const supabase = createSupabaseAdmin();

  if (isSuperAdmin) {
    const { data, error } = await supabase
      .from("candidates")
      .select(
        "id, name, email, phone, location, current_role, current_company, experience_years, skills, intent_score, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) throw error;
    if (audit) {
      await writeAccessAuditBatch(
        audit.userId,
        ((data ?? []) as Array<{ id?: string }>).map((row) => row.id ?? "").filter(Boolean),
        "view_pii",
        {
          route: "GET /api/export",
          export_type: "candidates",
          organisation_id: audit.organisationId ?? null,
          scope: "super_admin",
        },
        audit.ipAddress,
        audit.userAgent,
      );
    }

    return toCsv(
      [
        "Name",
        "Email",
        "Phone",
        "Location",
        "Current Role",
        "Current Company",
        "Experience Years",
        "Skills",
        "Intent Score",
        "Created At",
      ],
      (data ?? []) as Record<string, unknown>[],
      [
        "name",
        "email",
        "phone",
        "location",
        "current_role",
        "current_company",
        "experience_years",
        "skills",
        "intent_score",
        "created_at",
      ],
    );
  }

  // Non-super_admin: only candidates accessible via pipeline_candidates or fit_scores
  if (!orgId) return toCsv([], [], []);

  let jobIds: string[];
  if (hmJobIds) {
    jobIds = hmJobIds;
  } else {
    const { data: jobs } = await supabase.from("jobs").select("id").eq("organisation_id", orgId);
    jobIds = (jobs ?? []).map((j: Record<string, unknown>) => j.id as string);
  }
  if (jobIds.length === 0) return toCsv([], [], []);

  // Collect candidate IDs from pipeline_candidates and fit_scores
  const [pcRes, fsRes] = await Promise.all([
    supabase.from("pipeline_candidates").select("candidate_id").in("job_id", jobIds),
    supabase
      .from("fit_scores")
      .select("candidate_id")
      .in("job_id", jobIds)
      .or("is_test_run.eq.false,is_test_run.is.null"),
  ]);

  const candidateIds = [
    ...new Set([
      ...(pcRes.data ?? []).map((r: Record<string, unknown>) => r.candidate_id as string),
      ...(fsRes.data ?? []).map((r: Record<string, unknown>) => r.candidate_id as string),
    ]),
  ];

  if (candidateIds.length === 0) return toCsv([], [], []);

  const { data, error } = await supabase
    .from("candidates")
    .select(
      "id, name, email, phone, location, current_role, current_company, experience_years, skills, intent_score, created_at",
    )
    .in("id", candidateIds)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) throw error;
  if (audit) {
    await writeAccessAuditBatch(
      audit.userId,
      ((data ?? []) as Array<{ id?: string }>).map((row) => row.id ?? "").filter(Boolean),
      "view_pii",
      {
        route: "GET /api/export",
        export_type: "candidates",
        organisation_id: audit.organisationId ?? null,
        scope: "organisation",
      },
      audit.ipAddress,
      audit.userAgent,
    );
  }

  return toCsv(
    [
      "Name",
      "Email",
      "Phone",
      "Location",
      "Current Role",
      "Current Company",
      "Experience Years",
      "Skills",
      "Intent Score",
      "Created At",
    ],
    (data ?? []) as Record<string, unknown>[],
    [
      "name",
      "email",
      "phone",
      "location",
      "current_role",
      "current_company",
      "experience_years",
      "skills",
      "intent_score",
      "created_at",
    ],
  );
}

// ---------------------------------------------------------------------------
// Applications export
// ---------------------------------------------------------------------------
async function exportApplications(
  orgId: string | null,
  isSuperAdmin: boolean,
  hmJobIds: string[] | null,
  audit?: ExportAudit,
) {
  const supabase = createSupabaseAdmin();

  let query = supabase
    .from("applications")
    .select(
      "status, created_at, viewed_at, cover_note, candidates(id, name), jobs!inner(title, organisation_id, organisations!jobs_organisation_id_fkey(name))",
    );

  if (!isSuperAdmin) {
    if (!orgId) return toCsv([], [], []);
    query = query.eq("jobs.organisation_id", orgId);
    if (hmJobIds) {
      if (hmJobIds.length === 0) return toCsv([], [], []);
      query = query.in("job_id", hmJobIds);
    }
  }

  const { data, error } = await query.order("created_at", { ascending: false }).limit(5000);
  if (error) throw error;

  const rows = (data ?? []).map((row: Record<string, unknown>) => {
    const candidate = row.candidates as Record<string, unknown> | null;
    const job = row.jobs as Record<string, unknown> | null;
    const org = job?.organisations as Record<string, unknown> | null;
    return {
      candidate_name: candidate?.name ?? "",
      job_title: job?.title ?? "",
      company: org?.name ?? "",
      status: row.status,
      applied_at: row.created_at,
      viewed_at: row.viewed_at,
      cover_note: row.cover_note,
    };
  });

  if (audit) {
    await writeExportAccessAudit(audit, "applications", isSuperAdmin, collectCandidateIds(data));
  }

  return toCsv(
    ["Candidate Name", "Job Title", "Company", "Status", "Applied At", "Viewed At", "Cover Note"],
    rows,
    ["candidate_name", "job_title", "company", "status", "applied_at", "viewed_at", "cover_note"],
  );
}

// ---------------------------------------------------------------------------
// Pipeline export
// ---------------------------------------------------------------------------
async function exportPipeline(
  orgId: string | null,
  isSuperAdmin: boolean,
  hmJobIds: string[] | null,
  audit?: ExportAudit,
) {
  const supabase = createSupabaseAdmin();

  let query = supabase
    .from("pipeline_candidates")
    .select(
      "stage_id, status, interview_scheduled_at, interview_outcome, recruiter_rating, created_at, candidates(id, name), jobs!inner(id, title, organisation_id)",
    );

  // Scope the query itself for non-super_admin so RLS-bypassing admin reads
  // never pull other tenants' rows into memory (jobs!inner drops non-matching parents).
  if (!isSuperAdmin) {
    if (!orgId) return toCsv([], [], []);
    query = query.eq("jobs.organisation_id", orgId);
    if (hmJobIds) {
      if (hmJobIds.length === 0) return toCsv([], [], []);
      query = query.in("job_id", hmJobIds);
    }
  }

  const { data, error } = await query.order("created_at", { ascending: false }).limit(5000);
  if (error) throw error;

  const filtered = (data ?? []) as Record<string, unknown>[];

  if (audit) {
    await writeExportAccessAudit(audit, "pipeline", isSuperAdmin, collectCandidateIds(filtered));
  }

  // Collect stage IDs to resolve stage names
  const stageIds = [
    ...new Set(filtered.map((r) => r.stage_id as string | null).filter(Boolean)),
  ] as string[];

  const stageMap = new Map<string, string>();
  if (stageIds.length > 0) {
    const { data: stages } = await supabase
      .from("pipeline_stages")
      .select("id, stage_name")
      .in("id", stageIds);
    for (const s of (stages ?? []) as Record<string, unknown>[]) {
      stageMap.set(s.id as string, s.stage_name as string);
    }
  }

  const rows = filtered.map((row) => {
    const candidate = row.candidates as Record<string, unknown> | null;
    const job = row.jobs as Record<string, unknown> | null;
    return {
      candidate_name: candidate?.name ?? "",
      job_title: job?.title ?? "",
      stage: stageMap.get(row.stage_id as string) ?? "",
      status: row.status,
      interview_scheduled: row.interview_scheduled_at,
      interview_outcome: row.interview_outcome,
      recruiter_rating: row.recruiter_rating,
      added_at: row.created_at,
    };
  });

  return toCsv(
    [
      "Candidate Name",
      "Job Title",
      "Stage",
      "Status",
      "Interview Scheduled",
      "Interview Outcome",
      "Recruiter Rating",
      "Added At",
    ],
    rows,
    [
      "candidate_name",
      "job_title",
      "stage",
      "status",
      "interview_scheduled",
      "interview_outcome",
      "recruiter_rating",
      "added_at",
    ],
  );
}

// ---------------------------------------------------------------------------
// GET /api/export?type=candidates|applications|pipeline
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!hasRole(ctx, ...ALLOWED_ROLES)) {
      return jsonError("Forbidden", 403);
    }

    // Rate limit: 5 exports per 60 seconds per user
    const rl = await checkRateLimit({
      key: `export:${ctx.userId}`,
      limit: 5,
      windowSecs: 60,
    });
    if (!rl.allowed) {
      return jsonError("Rate limit exceeded. Please wait before exporting again.", 429);
    }

    const { searchParams } = request.nextUrl;
    const type = searchParams.get("type") as ExportType | null;

    if (!type || !EXPORT_TYPES.includes(type)) {
      return jsonError(`Invalid export type. Must be one of: ${EXPORT_TYPES.join(", ")}`, 400);
    }

    const isSuperAdmin = hasRole(ctx, "super_admin");
    const orgId = ctx.organisationId;
    const supabaseForHm = createSupabaseAdmin();
    const hmJobIds =
      hasRole(ctx, "hiring_manager") && orgId
        ? await listHiringManagerJobIds(supabaseForHm, orgId, ctx.userId)
        : null;

    const audit: ExportAudit = {
      userId: ctx.userId,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: request.headers.get("user-agent"),
      organisationId: orgId,
    };

    let csv: string;

    switch (type) {
      case "candidates":
        csv = await exportCandidates(orgId, isSuperAdmin, hmJobIds, audit);
        break;
      case "applications":
        csv = await exportApplications(orgId, isSuperAdmin, hmJobIds, audit);
        break;
      case "pipeline":
        csv = await exportPipeline(orgId, isSuperAdmin, hmJobIds, audit);
        break;
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `${type}-export-${timestamp}.csv`;

    logger.info("CSV export completed", {
      userId: ctx.userId,
      type,
      organisationId: orgId,
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=${filename}`,
      },
    });
  } catch (err) {
    logger.error("CSV export failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return jsonError("Export failed. Please try again later.", 500);
  }
}
