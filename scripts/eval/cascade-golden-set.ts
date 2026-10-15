/**
 * Golden-set eval harness for V3 cascade (NDCG@10 / recall@boundary).
 * Usage: npx tsx scripts/eval/cascade-golden-set.ts --job-id <uuid>
 */
import { createSupabaseAdmin } from "@/lib/supabase/admin";

function ndcgAtK(relevance: number[], k: number): number {
  const top = relevance.slice(0, k);
  const dcg = top.reduce((sum, rel, i) => sum + rel / Math.log2(i + 2), 0);
  const ideal = [...relevance].sort((a, b) => b - a).slice(0, k);
  const idcg = ideal.reduce((sum, rel, i) => sum + rel / Math.log2(i + 2), 0);
  return idcg === 0 ? 0 : dcg / idcg;
}

async function main() {
  const jobId = process.argv.find((a) => a.startsWith("--job-id="))?.split("=")[1];
  if (!jobId) {
    console.error("Provide --job-id=<uuid>");
    process.exit(1);
  }

  const admin = createSupabaseAdmin();
  const { data: scores } = await admin
    .from("fit_scores")
    .select("candidate_id, overall_score, scoring_method")
    .eq("job_id", jobId)
    .eq("scoring_status", "scored")
    .is("superseded_at", null)
    .order("overall_score", { ascending: false })
    .limit(50);

  const relevance = (scores ?? []).map((s) => (s.overall_score >= 70 ? 1 : 0));
  const ndcg10 = ndcgAtK(relevance, 10);
  const boundaryRecall =
    relevance.filter((r) => r === 1).length /
    Math.max(
      1,
      (scores ?? []).filter((s) => s.overall_score >= 65 && s.overall_score <= 75).length,
    );

  console.log(
    JSON.stringify(
      {
        jobId,
        rows: scores?.length ?? 0,
        ndcg_at_10: Number(ndcg10.toFixed(4)),
        recall_at_boundary: Number(boundaryRecall.toFixed(4)),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
