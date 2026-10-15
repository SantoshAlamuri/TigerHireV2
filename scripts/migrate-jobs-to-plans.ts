/**
 * Idempotent backfill: jobs → recruitment_plans + plan_stages from pipeline_stages.
 *
 * Usage:
 *   npx tsx scripts/migrate-jobs-to-plans.ts [--dry-run]
 *
 * Logs failures to docs/migration-reports/plans-backfill.md
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { inferPlanStageType } from "../src/lib/recruitment-plan/infer-stage-type";
import { DEFAULT_PLAN_STAGES } from "../src/lib/recruitment-plan/default-plan-stages";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function planStatusFromJobStatus(jobStatus: string | null | undefined): string {
  const s = String(jobStatus ?? "").toLowerCase();
  if (s === "open" || s === "active") return "active";
  if (s === "closed" || s === "filled") return "completed";
  if (s === "paused") return "paused";
  if (s === "archived") return "archived";
  return "draft";
}

type FailureRow = { job_id: string; reason: string };

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const reportDir = path.resolve(process.cwd(), "docs/migration-reports");
  const reportPath = path.join(reportDir, "plans-backfill.md");
  fs.mkdirSync(reportDir, { recursive: true });

  const failures: FailureRow[] = [];
  let jobsScanned = 0;
  let plansCreated = 0;
  let plansSkipped = 0;
  let stagesInserted = 0;

  const pageSize = 100;
  let offset = 0;

  for (;;) {
    const { data: jobs, error: jobsErr } = await supabase
      .from("jobs")
      .select("id, organisation_id, status, assigned_recruiter_id, hiring_manager_id")
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (jobsErr) throw new Error(`Failed to list jobs: ${jobsErr.message}`);
    if (!jobs?.length) break;

    for (const job of jobs) {
      jobsScanned += 1;
      const jobId = job.id as string;

      const { data: existingPlan } = await supabase
        .from("recruitment_plans")
        .select("id")
        .eq("job_id", jobId)
        .maybeSingle();

      let planId = existingPlan?.id as string | undefined;
      if (planId) {
        const { count: stageCount } = await supabase
          .from("plan_stages")
          .select("id", { count: "exact", head: true })
          .eq("plan_id", planId);
        if ((stageCount ?? 0) > 0) {
          plansSkipped += 1;
          continue;
        }
      }

      let createdBy =
        (job.assigned_recruiter_id as string | null) ?? (job.hiring_manager_id as string | null);
      if (!createdBy) {
        const { data: fallbackProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("organisation_id", job.organisation_id)
          .eq("is_active", true)
          .in("role", ["recruiter", "leadership", "super_admin"])
          .limit(1)
          .maybeSingle();
        createdBy = (fallbackProfile?.id as string | null) ?? null;
      }
      if (!createdBy) {
        failures.push({ job_id: jobId, reason: "No assigned_recruiter_id or hiring_manager_id" });
        continue;
      }

      const status = planStatusFromJobStatus(job.status as string);
      const now = new Date().toISOString();

      if (dryRun) {
        plansCreated += 1;
        continue;
      }

      if (!planId) {
        const { data: planRow, error: planErr } = await supabase
          .from("recruitment_plans")
          .insert({
            organisation_id: job.organisation_id,
            job_id: jobId,
            status,
            target_days_to_fill: 30,
            created_by: createdBy,
            activated_at: status === "active" ? now : null,
            updated_at: now,
          })
          .select("id")
          .single();

        if (planErr || !planRow) {
          failures.push({
            job_id: jobId,
            reason: planErr?.message ?? "plan insert returned no row",
          });
          continue;
        }
        plansCreated += 1;
        planId = planRow.id as string;
      }

      const { data: pipelineStages, error: psErr } = await supabase
        .from("pipeline_stages")
        .select("stage_name, stage_order, stage_type, interviewer_user_id, sla_days")
        .eq("job_id", jobId)
        .order("stage_order", { ascending: true });

      if (psErr) {
        failures.push({ job_id: jobId, reason: `pipeline_stages: ${psErr.message}` });
        continue;
      }

      const stagePayloads =
        (pipelineStages ?? []).length > 0
          ? (pipelineStages ?? []).map((row) => ({
              plan_id: planId,
              stage_order: row.stage_order as number,
              stage_type: inferPlanStageType({
                stageName: String(row.stage_name),
                pipelineStageType: row.stage_type as string | null,
              }),
              display_name: String(row.stage_name),
              primary_interviewer_id: (row.interviewer_user_id as string | null) ?? null,
              backup_interviewer_id: null,
              duration_minutes: null,
              format: null,
              scorecard_template_id: null,
              comms_template_id: null,
              approval_gate: "none",
              target_dwell_days: (row.sla_days as number | null) ?? 5,
              is_active: true,
            }))
          : DEFAULT_PLAN_STAGES.map((s) => ({
              plan_id: planId,
              stage_order: s.stage_order,
              stage_type: s.stage_type,
              display_name: s.display_name,
              primary_interviewer_id: null,
              backup_interviewer_id: null,
              duration_minutes: s.duration_minutes ?? null,
              format: s.format ?? null,
              scorecard_template_id: null,
              comms_template_id: null,
              approval_gate: s.approval_gate ?? "none",
              target_dwell_days: s.target_dwell_days,
              is_active: true,
            }));

      const { error: stagesErr } = await supabase.from("plan_stages").insert(stagePayloads);
      if (stagesErr) {
        failures.push({ job_id: jobId, reason: `plan_stages: ${stagesErr.message}` });
        continue;
      }
      stagesInserted += stagePayloads.length;

      await supabase.from("plan_history").insert({
        plan_id: planId,
        actor_type: "system",
        event_type: "plan_backfill",
        event_summary: "Recruitment plan backfilled from pipeline",
        details: {
          source: (pipelineStages ?? []).length > 0 ? "pipeline_stages" : "default_template",
        },
      });
    }

    offset += pageSize;
    if (jobs.length < pageSize) break;
  }

  const lines = [
    `# Plans backfill report`,
    ``,
    `Run at: ${new Date().toISOString()}`,
    `Mode: ${dryRun ? "dry-run" : "live"}`,
    ``,
    `| Metric | Count |`,
    `| --- | --- |`,
    `| Jobs scanned | ${jobsScanned} |`,
    `| Plans created | ${plansCreated} |`,
    `| Plans skipped (existing) | ${plansSkipped} |`,
    `| Plan stages inserted | ${stagesInserted} |`,
    `| Failures | ${failures.length} |`,
    ``,
  ];

  if (failures.length > 0) {
    lines.push(`## Failures`, ``, `| job_id | reason |`, `| --- | --- |`);
    for (const f of failures) {
      lines.push(`| ${f.job_id} | ${f.reason.replace(/\|/g, "\\|")} |`);
    }
    lines.push("");
  }

  fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
  console.log(`Report written to ${reportPath}`);
  console.log(
    JSON.stringify({
      jobsScanned,
      plansCreated,
      plansSkipped,
      stagesInserted,
      failures: failures.length,
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
