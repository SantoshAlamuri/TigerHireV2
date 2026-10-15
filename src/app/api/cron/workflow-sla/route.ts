import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { recordHiringOfferAuditEvent } from "@/lib/audit/hiring-offer-audit";
import { logger } from "@/lib/observability/logger";

/** Optional JSON body on manual POST; cron typically sends no body. */
const cronPostBodySchema = z.union([z.record(z.string(), z.unknown()), z.object({})]);

async function runWorkflowSlaJob(): Promise<
  | { breached: number; reminders50: number; reminders90: number; escalated: number }
  | { error: string; status: number }
> {
  const admin = createSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data: dueStages, error: fetchErr } = await admin
    .from("workflow_stages")
    .select(
      "id, instance_id, status, sla_due_at, created_at, reminder_half_sent_at, reminder_ninety_sent_at, breach_recorded_at",
    )
    .not("sla_due_at", "is", null)
    .in("status", ["active", "pending", "escalated"]);

  if (fetchErr) {
    logger.error("workflow-sla fetch failed", { error: String(fetchErr.message) });
    return { error: "Query failed", status: 500 };
  }

  let breached = 0;
  let reminders50 = 0;
  let reminders90 = 0;
  let escalated = 0;
  for (const st of dueStages ?? []) {
    const { data: inst, error: instErr } = await admin
      .from("workflow_instances")
      .select("organisation_id, status, subject_type, subject_id")
      .eq("id", st.instance_id as string)
      .maybeSingle();

    if (instErr || !inst || inst.status !== "active") continue;

    const dueAtMs = new Date(st.sla_due_at as string).getTime();
    const createdAtMs = new Date(st.created_at as string).getTime();
    const nowMs = Date.now();
    const totalWindow = Math.max(1, dueAtMs - createdAtMs);
    const elapsed = Math.max(0, nowMs - createdAtMs);
    const ratio = elapsed / totalWindow;

    if (!st.reminder_half_sent_at && ratio >= 0.5) {
      await admin
        .from("workflow_stages")
        .update({
          reminder_half_sent_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", st.id as string);
      reminders50 += 1;
      await recordHiringOfferAuditEvent({
        organisationId: inst.organisation_id as string,
        entityType: "workflow_stage",
        entityId: st.id as string,
        eventType: "WORKFLOW_SLA_REMINDER_50",
        actorProfileId: null,
        actorRole: null,
        prevStatus: st.status as string,
        newStatus: st.status as string,
        channel: "system",
        metadata: {
          subject_type: inst.subject_type,
          subject_id: inst.subject_id,
          sla_due_at: st.sla_due_at,
        },
      });
    }

    if (!st.reminder_ninety_sent_at && ratio >= 0.9) {
      await admin
        .from("workflow_stages")
        .update({
          reminder_ninety_sent_at: nowIso,
          status: st.status === "active" ? "escalated" : st.status,
          updated_at: nowIso,
        })
        .eq("id", st.id as string);
      reminders90 += 1;
      escalated += st.status === "active" ? 1 : 0;
      await recordHiringOfferAuditEvent({
        organisationId: inst.organisation_id as string,
        entityType: "workflow_stage",
        entityId: st.id as string,
        eventType: "WORKFLOW_SLA_REMINDER_90",
        actorProfileId: null,
        actorRole: null,
        prevStatus: st.status as string,
        newStatus: st.status === "active" ? "escalated" : (st.status as string),
        channel: "system",
        metadata: {
          subject_type: inst.subject_type,
          subject_id: inst.subject_id,
          sla_due_at: st.sla_due_at,
        },
      });
    }

    if (dueAtMs > nowMs || st.breach_recorded_at) continue;

    const { error: updErr } = await admin
      .from("workflow_stages")
      .update({
        status: "breached",
        breach_recorded_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", st.id as string);

    if (updErr) {
      logger.warn("workflow-sla stage update failed", {
        stageId: st.id,
        error: String(updErr.message),
      });
      continue;
    }

    await recordHiringOfferAuditEvent({
      organisationId: inst.organisation_id as string,
      entityType: "workflow_stage",
      entityId: st.id as string,
      eventType: "WORKFLOW_SLA_BREACHED",
      actorProfileId: null,
      actorRole: null,
      prevStatus: st.status as string,
      newStatus: "breached",
      channel: "system",
      metadata: {
        subject_type: inst.subject_type,
        subject_id: inst.subject_id,
        sla_due_at: st.sla_due_at,
      },
    });
    breached += 1;
  }

  return { breached, reminders50, reminders90, escalated };
}

/**
 * GET /api/cron/workflow-sla — Vercel Cron uses GET by default.
 * POST also supported for manual triggers.
 * Auth: CRON_SECRET or CRON_SECRET_HASH in Bearer header.
 *
 * Note: stage `sla_due_at` is set when workflow instances are created. Tighter deadlines for
 * hiring_request.urgency === "urgent" (BRD) belong in that creation path, not in this job.
 */
export async function GET(request: NextRequest) {
  if (!(await validateCronSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runWorkflowSlaJob();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  if (!(await validateCronSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const raw = await request.text();
    if (raw.trim()) {
      cronPostBodySchema.parse(JSON.parse(raw));
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const result = await runWorkflowSlaJob();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
