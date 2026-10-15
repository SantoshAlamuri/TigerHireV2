/**
 * Hiring manager view: every yes-or-no the manager owes, one at a time.
 *
 * Turns the approvals inbox (GET /api/approvals) into decision cards. Offers
 * are left out for now; they are not in the new view yet.
 */
import type { ApprovalTaskItem } from "@/lib/approvals/task-types";

export interface DecisionCard {
  taskId: string;
  kind: "candidate" | "request";
  title: string;
  context: string;
  facts: [string, string][];
  note: string | null;
  yes: string;
  no: string;
  /** Extra fields the decision route needs. */
  body: { jobId?: string; candidateId?: string; requestId?: string };
  createdAt: string;
}

const lpa = (n: number | null | undefined) =>
  n && n > 0 ? `${Math.round(n / 10_000) / 10} LPA` : null;

export function cardsFromApprovals(items: ApprovalTaskItem[]): DecisionCard[] {
  const out: DecisionCard[] = [];
  for (const it of items) {
    if (it.source === "candidate_shortlist") {
      const p = it.payload;
      const facts: [string, string][] = [];
      if (p.fitScore != null)
        facts.push(["Score", `${Math.round(p.fitScore)}${p.fitBand ? `, ${p.fitBand}` : ""}`]);
      if (p.candidates?.location) facts.push(["Where", p.candidates.location]);
      const skills = (p.candidates?.skills ?? []).filter(Boolean).slice(0, 6);
      if (skills.length) facts.push(["Skills", skills.join(", ")]);
      out.push({
        taskId: it.id,
        kind: "candidate",
        title: p.candidates?.name?.trim() || "Unnamed candidate",
        context: `Shortlisted for ${p.jobTitle}`,
        facts,
        note: p.commentPreview,
        yes: "Yes, interview them",
        no: "Not for this role",
        body: { jobId: p.job_id, candidateId: p.candidate_id },
        createdAt: it.createdAt,
      });
    } else if (it.source === "hiring_request") {
      const p = it.payload;
      const facts: [string, string][] = [];
      if (p.department) facts.push(["Team", p.department]);
      if (p.headcount) facts.push(["People", String(p.headcount)]);
      const lo = lpa(p.budgetCtcMin);
      const hi = lpa(p.budgetCtcMax);
      if (lo || hi) facts.push(["Budget", lo && hi ? `${lo} to ${hi}` : (lo ?? hi)!]);
      if (p.urgency) facts.push(["Urgency", p.urgency]);
      out.push({
        taskId: it.id,
        kind: "request",
        title: p.requestTitle,
        context: p.reqCode ? `New role, ${p.reqCode}` : "New role",
        facts,
        note: p.commentPreview,
        yes: "Approve the role",
        no: "Send it back",
        body: { requestId: p.requestId },
        createdAt: it.createdAt,
      });
    }
  }
  // Candidates first (someone is waiting on an answer), then oldest first.
  return out.sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === "candidate" ? -1 : 1) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

/** Saying no always needs a reason, so the recruiter knows what to change. */
export function canDecide(decision: "approved" | "rejected", reason: string): boolean {
  return decision === "approved" || reason.trim().length >= 3;
}
