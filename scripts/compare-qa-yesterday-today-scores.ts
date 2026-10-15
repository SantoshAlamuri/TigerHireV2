/**
 * Compare FitScore before/after today's rescore for QA Engineer job.
 * Uses superseded fit_scores rows linked via superseded_by_id.
 */
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const JOB_ID = "861e8c58-9c72-4c46-8534-a02207a35cbc";
const EXCLUDED = new Set([
  "134a9416-952a-46e6-b265-245f33da3401",
  "e51881a3-461b-42c4-afcf-455101cf46c5",
  "3ffb4e92-2467-4cee-ab5c-605032cedb48",
  "30a7e854-53d4-43ed-b5e0-9c4e1817061e",
  "d5c8a827-2418-411a-94fc-41501708dfef",
  "47478384-9508-4a4d-9dda-63065a653398",
  "ea3b7abd-5504-4e00-abb5-6a8df5d2c73f",
  "2d6a94ef-4a45-48ce-92b2-fe2ac77895cf",
]);

type CompareRow = {
  candidateId: string;
  name: string;
  before: number | null;
  after: number | null;
  delta: number | null;
  shadowBefore: number | null;
  shadowAfter: number | null;
  idealBefore: number | null;
  idealAfter: number | null;
  bandBefore: string | null;
  bandAfter: string | null;
  supersededAt: string;
};

async function main() {
  const { createSupabaseAdmin } = await import("@/lib/supabase/admin");
  const admin = createSupabaseAdmin();

  const { data: superseded, error } = await admin
    .from("fit_scores")
    .select(
      "id, candidate_id, overall_score, shadow_score, ideal_match_pct, market_percentile, band, superseded_at, superseded_by_id, created_at",
    )
    .eq("job_id", JOB_ID)
    .eq("is_test_run", false)
    .not("superseded_at", "is", null)
    .not("superseded_by_id", "is", null)
    .gte("superseded_at", "2026-05-20T00:00:00Z")
    .order("superseded_at", { ascending: true });

  if (error) throw error;

  const newIds = [...new Set((superseded ?? []).map((r) => r.superseded_by_id).filter(Boolean))];
  const { data: newRows, error: newErr } = await admin
    .from("fit_scores")
    .select(
      "id, candidate_id, overall_score, shadow_score, ideal_match_pct, market_percentile, band, created_at",
    )
    .in("id", newIds.length ? newIds : ["00000000-0000-0000-0000-000000000000"]);

  if (newErr) throw newErr;

  const newById = new Map((newRows ?? []).map((r) => [r.id, r]));
  const candIds = [...new Set((superseded ?? []).map((r) => r.candidate_id))];
  const { data: cands } = await admin
    .from("candidates")
    .select("id, name, full_name, email")
    .in("id", candIds.length ? candIds : ["00000000-0000-0000-0000-000000000000"]);
  const candById = new Map((cands ?? []).map((c) => [c.id, c]));

  const rows: CompareRow[] = [];
  for (const old of superseded ?? []) {
    const neu = newById.get(String(old.superseded_by_id));
    if (!neu) continue;
    const c = candById.get(old.candidate_id);
    const name = String(c?.full_name ?? c?.name ?? old.candidate_id.slice(0, 8));
    const before = old.overall_score as number | null;
    const after = neu.overall_score as number | null;
    rows.push({
      candidateId: old.candidate_id,
      name,
      before,
      after,
      delta: before != null && after != null ? after - before : null,
      shadowBefore: old.shadow_score as number | null,
      shadowAfter: neu.shadow_score as number | null,
      idealBefore: old.ideal_match_pct as number | null,
      idealAfter: neu.ideal_match_pct as number | null,
      bandBefore: old.band as string | null,
      bandAfter: neu.band as string | null,
      supersededAt: String(old.superseded_at),
    });
  }

  rows.sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));

  const changed = rows.filter((r) => r.delta !== 0);
  const unchanged = rows.filter((r) => r.delta === 0);

  console.log("\n=== QA Engineer FitScore: yesterday → today ===\n");
  console.log(
    `Rescored pairs: ${rows.length} | Changed: ${changed.length} | Unchanged: ${unchanged.length}`,
  );
  console.log(`(8 validation candidates excluded from today's rescore — not listed)\n`);

  console.log("--- Changed (sorted by |delta|) ---\n");
  console.log(
    [
      "Name".padEnd(30),
      "Before".padStart(6),
      "After".padStart(6),
      "Delta".padStart(6),
      "Shadow".padStart(12),
      "Ideal%".padStart(12),
      "Band",
    ].join(" "),
  );
  console.log("-".repeat(95));

  for (const r of changed) {
    const deltaStr = r.delta == null ? "—" : (r.delta >= 0 ? "+" : "") + r.delta;
    const shadow =
      r.shadowBefore != null && r.shadowAfter != null ? `${r.shadowBefore}→${r.shadowAfter}` : "—";
    const ideal =
      r.idealBefore != null && r.idealAfter != null ? `${r.idealBefore}→${r.idealAfter}` : "—";
    const band = `${r.bandBefore ?? "?"} → ${r.bandAfter ?? "?"}`;
    console.log(
      [
        r.name.slice(0, 29).padEnd(30),
        String(r.before ?? "—").padStart(6),
        String(r.after ?? "—").padStart(6),
        deltaStr.padStart(6),
        shadow.padStart(12),
        ideal.padStart(12),
        band,
      ].join(" "),
    );
  }

  if (unchanged.length) {
    console.log(`\n--- Unchanged (${unchanged.length}) ---`);
    for (const r of unchanged) {
      console.log(`  ${r.name}: ${r.before}`);
    }
  }

  const deltas = changed.map((r) => r.delta!).filter((d) => d != null);
  if (deltas.length) {
    const up = deltas.filter((d) => d > 0).length;
    const down = deltas.filter((d) => d < 0).length;
    const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    console.log(
      `\nSummary: ${up} increased, ${down} decreased | avg delta ${avg.toFixed(1)} | max +${Math.max(...deltas)} / ${Math.min(...deltas)}`,
    );
  }

  const outPath = path.resolve(
    process.cwd(),
    "scripts/output/qa-engineer-score-delta-yesterday-today.csv",
  );
  const csvLines = [
    "candidate_id,name,before,after,delta,shadow_before,shadow_after,ideal_before,ideal_after,band_before,band_after,superseded_at",
    ...rows.map((r) =>
      [
        r.candidateId,
        JSON.stringify(r.name),
        r.before ?? "",
        r.after ?? "",
        r.delta ?? "",
        r.shadowBefore ?? "",
        r.shadowAfter ?? "",
        r.idealBefore ?? "",
        r.idealAfter ?? "",
        r.bandBefore ?? "",
        r.bandAfter ?? "",
        r.supersededAt,
      ].join(","),
    ),
  ];
  const fs = await import("node:fs");
  fs.writeFileSync(outPath, csvLines.join("\n") + "\n");
  console.log(`\nCSV: ${outPath}\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
