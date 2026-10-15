import type { SupabaseClient } from "@supabase/supabase-js";

export type StageActivityItem = {
  id: string;
  candidate_id: string;
  candidate_name: string;
  activity_type:
    | "whatsapp_comms"
    | "slot_picker"
    | "screening"
    | "offer"
    | "plan_event"
    | "human_move"
    | "human_decision"
    | "referrer";
  summary: string;
  status?: string | null;
  occurred_at: string;
  referrer_name?: string | null;
  actor_label?: string | null;
};

function classifyPlanHistory(
  eventType: string,
  actorType: string,
): StageActivityItem["activity_type"] {
  if (actorType === "human") {
    if (
      eventType === "pipeline_stage_moved" ||
      eventType === "candidate_stage_moved" ||
      eventType.includes("moved")
    ) {
      return "human_move";
    }
    return "human_decision";
  }
  if (eventType === "comms_sent" || eventType === "nudge_sent") return "whatsapp_comms";
  if (eventType === "slot_picker_triggered" || eventType === "slot_booked") return "slot_picker";
  return "plan_event";
}

/**
 * Recent per-candidate activity for a job (human decisions, pipeline moves, automation, offers).
 */
export async function listJobStageCandidateActivity(
  admin: SupabaseClient,
  params: { jobId: string; planId?: string | null; limit?: number },
): Promise<StageActivityItem[]> {
  const limit = params.limit ?? 40;
  const items: StageActivityItem[] = [];

  const candidateNameById = new Map<string, string>();
  const referrerByCandidate = new Map<string, string | null>();
  const profileNameById = new Map<string, string>();

  const { data: apps } = await admin
    .from("applications")
    .select("candidate_id, direct_referrer_id, profiles:direct_referrer_id(full_name)")
    .eq("job_id", params.jobId);

  for (const app of apps ?? []) {
    const cid = app.candidate_id as string;
    const prof = app.profiles as { full_name?: string | null } | null;
    if (prof?.full_name) referrerByCandidate.set(cid, prof.full_name);
  }

  const { data: pipeline } = await admin
    .from("pipeline_candidates")
    .select("id, candidate_id, candidates(name, full_name)")
    .eq("job_id", params.jobId);

  const pipelineCandidateIds: string[] = [];
  for (const pc of pipeline ?? []) {
    const c = pc.candidates as { name?: string | null; full_name?: string | null } | null;
    const cid = pc.candidate_id as string;
    pipelineCandidateIds.push(pc.id as string);
    candidateNameById.set(cid, c?.full_name ?? c?.name ?? "Candidate");
  }

  if (params.planId) {
    const { data: history } = await admin
      .from("plan_history")
      .select("id, candidate_id, actor_type, actor_user_id, event_type, event_summary, created_at")
      .eq("plan_id", params.planId)
      .order("created_at", { ascending: false })
      .limit(limit);

    const actorIds = [
      ...new Set(
        (history ?? [])
          .map((r) => r.actor_user_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (actorIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, full_name")
        .in("id", actorIds);
      for (const p of profiles ?? []) {
        profileNameById.set(p.id as string, (p.full_name as string) ?? "Team member");
      }
    }

    for (const row of history ?? []) {
      const cid = row.candidate_id as string | null;
      if (!cid) continue;
      const actorType = (row.actor_type as string) ?? "system";
      const et = row.event_type as string;
      const type = classifyPlanHistory(et, actorType);
      const actorUserId = row.actor_user_id as string | null;
      const actorLabel =
        actorType === "human" && actorUserId
          ? (profileNameById.get(actorUserId) ?? "Recruiter")
          : actorType === "system"
            ? "System"
            : null;

      items.push({
        id: `ph:${row.id}`,
        candidate_id: cid,
        candidate_name: candidateNameById.get(cid) ?? "Candidate",
        activity_type: type,
        summary: row.event_summary as string,
        occurred_at: row.created_at as string,
        referrer_name: referrerByCandidate.get(cid) ?? null,
        actor_label: actorLabel,
      });
    }
  }

  if (pipelineCandidateIds.length > 0) {
    const { data: transitions } = await admin
      .from("pipeline_stage_transitions")
      .select("id, candidate_id, from_stage, to_stage, moved_by, entered_at")
      .eq("job_id", params.jobId)
      .order("entered_at", { ascending: false })
      .limit(25);

    const moverIds = [
      ...new Set(
        (transitions ?? [])
          .map((r) => r.moved_by as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (moverIds.length > 0) {
      const missing = moverIds.filter((id) => !profileNameById.has(id));
      if (missing.length > 0) {
        const { data: profiles } = await admin
          .from("profiles")
          .select("id, full_name")
          .in("id", missing);
        for (const p of profiles ?? []) {
          profileNameById.set(p.id as string, (p.full_name as string) ?? "Team member");
        }
      }
    }

    for (const row of transitions ?? []) {
      const cid = row.candidate_id as string;
      const moverId = row.moved_by as string | null;
      const fromStage = (row.from_stage as string | null) ?? "—";
      const toStage = row.to_stage as string;
      items.push({
        id: `pst:${row.id}`,
        candidate_id: cid,
        candidate_name: candidateNameById.get(cid) ?? "Candidate",
        activity_type: "human_move",
        summary: `Moved from ${fromStage} → ${toStage}`,
        occurred_at: row.entered_at as string,
        referrer_name: referrerByCandidate.get(cid) ?? null,
        actor_label: moverId ? (profileNameById.get(moverId) ?? "Recruiter") : "Recruiter",
      });
    }

    // Two mismatches in one select, so it always failed whole and no shortlist
    // approval ever appeared in stage activity: shortlist_approvals has
    // `decided_at`, not `created_at`, and profiles carries no `email` — that
    // lives on auth.users.
    const { data: approvals } = await admin
      .from("shortlist_approvals")
      .select(
        "id, pipeline_candidate_id, approver_role, decision, decided_at, profiles:approver_id(full_name)",
      )
      .in("pipeline_candidate_id", pipelineCandidateIds)
      .order("decided_at", { ascending: false })
      .limit(20);

    const pcToCandidate = new Map<string, string>();
    for (const pc of pipeline ?? []) {
      pcToCandidate.set(pc.id as string, pc.candidate_id as string);
    }

    for (const row of approvals ?? []) {
      const pcId = row.pipeline_candidate_id as string;
      const cid = pcToCandidate.get(pcId);
      if (!cid) continue;
      const prof = row.profiles as { full_name?: string | null } | null;
      const role = (row.approver_role as string).replace(/_/g, " ");
      items.push({
        id: `sa:${row.id}`,
        candidate_id: cid,
        candidate_name: candidateNameById.get(cid) ?? "Candidate",
        activity_type: "human_decision",
        summary: `${role} ${row.decision as string} shortlist`,
        status: row.decision as string,
        occurred_at: row.decided_at as string,
        referrer_name: referrerByCandidate.get(cid) ?? null,
        actor_label: prof?.full_name ?? role,
      });
    }
  }

  const { data: pickers } = await admin
    .from("interview_slot_picker_requests")
    .select("id, candidate_id, status, sent_at, candidates(name, full_name)")
    .eq("job_id", params.jobId)
    .order("sent_at", { ascending: false })
    .limit(20);

  for (const row of pickers ?? []) {
    const cid = row.candidate_id as string;
    const c = row.candidates as { name?: string; full_name?: string } | null;
    items.push({
      id: `sp:${row.id}`,
      candidate_id: cid,
      candidate_name: c?.full_name ?? c?.name ?? candidateNameById.get(cid) ?? "Candidate",
      activity_type: "slot_picker",
      summary: `Slot picker ${row.status as string}`,
      status: row.status as string,
      occurred_at: (row.sent_at as string) ?? new Date().toISOString(),
      referrer_name: referrerByCandidate.get(cid) ?? null,
    });
  }

  const candidateIds = [...candidateNameById.keys()];
  if (candidateIds.length > 0) {
    const { data: screenings } = await admin
      .from("screening_jobs")
      .select("id, candidate_id, status, updated_at, recommendation")
      .eq("req_id", params.jobId)
      .in("candidate_id", candidateIds)
      .order("updated_at", { ascending: false })
      .limit(20);

    for (const row of screenings ?? []) {
      const cid = row.candidate_id as string;
      items.push({
        id: `scr:${row.id}`,
        candidate_id: cid,
        candidate_name: candidateNameById.get(cid) ?? "Candidate",
        activity_type: "screening",
        summary: `Screening ${row.status as string}${row.recommendation ? ` · ${row.recommendation}` : ""}`,
        status: row.status as string,
        occurred_at: (row.updated_at as string) ?? new Date().toISOString(),
        referrer_name: referrerByCandidate.get(cid) ?? null,
      });
    }
  }

  const { data: offers } = await admin
    .from("offers")
    .select(
      "id, status, role_title, updated_at, applications!inner(job_id, candidate_id, candidates(name, full_name))",
    )
    .eq("applications.job_id", params.jobId)
    .order("updated_at", { ascending: false })
    .limit(15);

  for (const row of offers ?? []) {
    const app = row.applications as {
      candidate_id?: string;
      candidates?: { name?: string; full_name?: string } | null;
    } | null;
    const cid = app?.candidate_id as string;
    if (!cid) continue;
    const c = app?.candidates;
    items.push({
      id: `of:${row.id}`,
      candidate_id: cid,
      candidate_name: c?.full_name ?? c?.name ?? candidateNameById.get(cid) ?? "Candidate",
      activity_type: "offer",
      summary: `Offer ${row.status as string} — ${row.role_title as string}`,
      status: row.status as string,
      occurred_at: (row.updated_at as string) ?? new Date().toISOString(),
      referrer_name: referrerByCandidate.get(cid) ?? null,
    });
  }

  const seen = new Set<string>();
  return items
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, limit);
}
