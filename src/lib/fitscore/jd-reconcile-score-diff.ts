import type { SupabaseClient } from "@supabase/supabase-js";

export type JdReconcileScoreDiff = {
  candidate_id: string;
  candidate_name: string;
  old_verdict: string;
  new_verdict: string;
  old_score: number;
  new_score: number;
  direction: "improved" | "declined" | "unchanged";
};

type ScoreSnapshotRow = {
  candidate_id: string;
  ideal_match_pct: number | null;
  verdict: string | null;
  candidates?: { name?: string | null; full_name?: string | null } | null;
};

function candidateNameFromRow(row: ScoreSnapshotRow): string {
  const c = row.candidates;
  const name = c?.full_name ?? c?.name;
  return name?.trim() || "Candidate";
}

function scoreValue(row: ScoreSnapshotRow): number {
  return typeof row.ideal_match_pct === "number" ? row.ideal_match_pct : 0;
}

function verdictValue(row: ScoreSnapshotRow): string {
  return row.verdict?.trim() || "Unknown";
}

function scoreDirection(oldScore: number, newScore: number): JdReconcileScoreDiff["direction"] {
  if (newScore > oldScore) return "improved";
  if (newScore < oldScore) return "declined";
  return "unchanged";
}

export async function snapshotActiveFitScoresForJob(
  supabase: SupabaseClient,
  jobId: string,
  candidateIds: string[],
): Promise<Map<string, ScoreSnapshotRow>> {
  const map = new Map<string, ScoreSnapshotRow>();
  if (candidateIds.length === 0) return map;

  const chunkSize = 100;
  for (let i = 0; i < candidateIds.length; i += chunkSize) {
    const chunk = candidateIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("fit_scores")
      .select("candidate_id, ideal_match_pct, verdict, candidates(name, full_name)")
      .eq("job_id", jobId)
      .is("superseded_at", null)
      .or("is_test_run.eq.false,is_test_run.is.null")
      .in("candidate_id", chunk);
    if (error) throw error;
    for (const row of (data ?? []) as ScoreSnapshotRow[]) {
      map.set(String(row.candidate_id), row);
    }
  }

  return map;
}

export function computeJdReconcileScoreDiffs(
  before: Map<string, ScoreSnapshotRow>,
  after: Map<string, ScoreSnapshotRow>,
): JdReconcileScoreDiff[] {
  const diffs: JdReconcileScoreDiff[] = [];

  for (const [candidateId, afterRow] of after) {
    const beforeRow = before.get(candidateId);
    if (!beforeRow) continue;

    const oldVerdict = verdictValue(beforeRow);
    const newVerdict = verdictValue(afterRow);
    if (oldVerdict === newVerdict) continue;

    const oldScore = scoreValue(beforeRow);
    const newScore = scoreValue(afterRow);
    diffs.push({
      candidate_id: candidateId,
      candidate_name: candidateNameFromRow(afterRow) || candidateNameFromRow(beforeRow),
      old_verdict: oldVerdict,
      new_verdict: newVerdict,
      old_score: oldScore,
      new_score: newScore,
      direction: scoreDirection(oldScore, newScore),
    });
  }

  diffs.sort((a, b) => a.candidate_name.localeCompare(b.candidate_name));
  return diffs;
}

export function formatJdReconcileNotificationBody(params: {
  jobTitle: string;
  scoredCount: number;
  failedCount: number;
  verdictChanges: JdReconcileScoreDiff[];
}): string {
  const unchanged = Math.max(0, params.scoredCount - params.verdictChanges.length);
  const lines: string[] = [
    `JD Base approved for ${params.jobTitle}. ${params.scoredCount} candidates re-scored.`,
  ];

  if (params.failedCount > 0) {
    lines.push(`${params.failedCount} candidates failed to re-score.`);
  }

  if (params.verdictChanges.length > 0) {
    lines.push("");
    lines.push(`Verdict changes (${params.verdictChanges.length}):`);
    for (const diff of params.verdictChanges) {
      const delta = diff.new_score - diff.old_score;
      const deltaLabel = delta > 0 ? `+${delta}` : String(delta);
      lines.push(
        `• ${diff.candidate_name}: ${diff.old_verdict} → ${diff.new_verdict} (${deltaLabel})`,
      );
    }
  }

  if (unchanged > 0) {
    lines.push("");
    lines.push(`${unchanged} candidates unchanged.`);
  }

  return lines.join("\n");
}
