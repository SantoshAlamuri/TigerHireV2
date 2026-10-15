/**
 * In-depth FitScore audit for QA Engineer job:
 * - Yesterday vs today overall + dimension deltas
 * - Shadow / ideal / confidence shifts
 * - 8 validation candidates vs recruiter targets
 * - Extraction validation failures from rescore log
 *
 * Usage: npx tsx scripts/audit-qa-engineer-scoring-indepth.ts
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const JOB_ID = "861e8c58-9c72-4c46-8534-a02207a35cbc";
const RESCORE_DAY = "2026-05-20";
const LOG_PATH = path.resolve(
  process.cwd(),
  "scripts/output/qa-engineer-rescore-after-seed-cleanup.log",
);

const VALIDATION = [
  { id: "134a9416-952a-46e6-b265-245f33da3401", label: "Preethi", recruiter: 70 },
  { id: "e51881a3-461b-42c4-afcf-455101cf46c5", label: "Dhanush", recruiter: 70 },
  { id: "3ffb4e92-2467-4cee-ab5c-605032cedb48", label: "Subramanian", recruiter: 80 },
  { id: "30a7e854-53d4-43ed-b5e0-9c4e1817061e", label: "Arulmani", recruiter: 60 },
  { id: "d5c8a827-2418-411a-94fc-41501708dfef", label: "Prashanth", recruiter: 50 },
  { id: "47478384-9508-4a4d-9dda-63065a653398", label: "Vilas", recruiter: 75 },
  { id: "ea3b7abd-5504-4e00-abb5-6a8df5d2c73f", label: "Niranjan", recruiter: 30 },
  { id: "2d6a94ef-4a45-48ce-92b2-fe2ac77895cf", label: "Pratibha", recruiter: 60 },
];

const SCORE_SELECT =
  "id, candidate_id, overall_score, primary_score, shadow_score, ideal_match_pct, market_percentile, band, confidence, v2_score_breakdown, scoring_method, created_at, superseded_at, superseded_by_id";

type ScoreRow = {
  id: string;
  candidate_id: string;
  overall_score: number | null;
  primary_score: number | null;
  shadow_score: number | null;
  ideal_match_pct: number | null;
  market_percentile: number | null;
  band: string | null;
  confidence: string | null;
  v2_score_breakdown: Record<string, unknown> | null;
  scoring_method: string | null;
  created_at: string;
  superseded_at: string | null;
  superseded_by_id: string | null;
};

function dimValues(breakdown: Record<string, unknown> | null): Record<string, number> {
  const dims = (breakdown?.dimensions ?? {}) as Record<string, { value?: number }>;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(dims)) {
    if (typeof v?.value === "number") out[k] = v.value;
  }
  return out;
}

function parseExtractionFailures(logText: string): Map<string, string[]> {
  const byCandidate = new Map<string, string[]>();
  for (const line of logText.split("\n")) {
    if (!line.includes("fitscore_extraction_validation_failed")) continue;
    try {
      const jsonStart = line.indexOf("{");
      if (jsonStart < 0) continue;
      const payload = JSON.parse(line.slice(jsonStart)) as {
        candidate_id?: string;
        reason?: string;
      };
      if (!payload.candidate_id || !payload.reason) continue;
      const list = byCandidate.get(payload.candidate_id) ?? [];
      list.push(payload.reason);
      byCandidate.set(payload.candidate_id, list);
    } catch {
      /* skip malformed */
    }
  }
  return byCandidate;
}

async function main() {
  const { createSupabaseAdmin } = await import("@/lib/supabase/admin");
  const { getJdBaseByJobId } = await import("@/lib/fitscore/hybrid/jd-base");
  const admin = createSupabaseAdmin();

  const jdBase = await getJdBaseByJobId(admin, JOB_ID);
  const { data: job } = await admin.from("jobs").select("title").eq("id", JOB_ID).single();

  const { data: active } = await admin
    .from("fit_scores")
    .select(SCORE_SELECT)
    .eq("job_id", JOB_ID)
    .eq("is_test_run", false)
    .is("superseded_at", null);

  const activeIds = (active ?? []).map((r) => r.id);
  const { data: prevRows } = await admin
    .from("fit_scores")
    .select(SCORE_SELECT)
    .eq("job_id", JOB_ID)
    .eq("is_test_run", false)
    .in(
      "superseded_by_id",
      activeIds.length ? activeIds : ["00000000-0000-0000-0000-000000000000"],
    );

  const prevByNew = new Map(
    (prevRows ?? [])
      .filter((r) => r.superseded_at?.startsWith(RESCORE_DAY))
      .map((r) => [String(r.superseded_by_id), r as ScoreRow]),
  );

  const candIds = [...new Set((active ?? []).map((r) => r.candidate_id))];
  const { data: cands } = await admin
    .from("candidates")
    .select("id, name, full_name, email")
    .in("id", candIds);
  const candById = new Map((cands ?? []).map((c) => [c.id, c]));

  type Pair = {
    candidateId: string;
    name: string;
    email: string;
    before: ScoreRow;
    after: ScoreRow;
    delta: number;
    dimDeltas: Record<string, number>;
  };

  const pairs: Pair[] = [];
  for (const cur of (active ?? []) as ScoreRow[]) {
    const old = prevByNew.get(cur.id);
    if (!old) continue;
    const c = candById.get(cur.candidate_id);
    const beforeDims = dimValues(old.v2_score_breakdown);
    const afterDims = dimValues(cur.v2_score_breakdown);
    const allDimKeys = new Set([...Object.keys(beforeDims), ...Object.keys(afterDims)]);
    const dimDeltas: Record<string, number> = {};
    for (const k of allDimKeys) {
      const d = (afterDims[k] ?? 0) - (beforeDims[k] ?? 0);
      if (d !== 0) dimDeltas[k] = d;
    }
    pairs.push({
      candidateId: cur.candidate_id,
      name: String(c?.full_name ?? c?.name ?? cur.candidate_id.slice(0, 8)),
      email: String(c?.email ?? ""),
      before: old,
      after: cur,
      delta: (cur.overall_score ?? 0) - (old.overall_score ?? 0),
      dimDeltas,
    });
  }

  pairs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const dimImpact: Record<string, { totalDrop: number; totalRise: number; count: number }> = {};
  for (const p of pairs) {
    for (const [dim, d] of Object.entries(p.dimDeltas)) {
      if (!dimImpact[dim]) dimImpact[dim] = { totalDrop: 0, totalRise: 0, count: 0 };
      if (d < 0) dimImpact[dim].totalDrop += d;
      if (d > 0) dimImpact[dim].totalRise += d;
      dimImpact[dim].count += 1;
    }
  }

  const logText = fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, "utf-8") : "";
  const extractionFails = parseExtractionFailures(logText);

  const validationRows = [];
  for (const v of VALIDATION) {
    const row = (active ?? []).find((r) => r.candidate_id === v.id) as ScoreRow | undefined;
    validationRows.push({
      ...v,
      score: row?.overall_score ?? null,
      shadow: row?.shadow_score ?? null,
      ideal: row?.ideal_match_pct ?? null,
      band: row?.band ?? null,
      deltaRecruiter: row?.overall_score != null ? row.overall_score - v.recruiter : null,
    });
  }

  const changed = pairs.filter((p) => p.delta !== 0);
  const bandChanges = pairs.filter((p) => p.before.band !== p.after.band);
  const shadowDrops = pairs.filter(
    (p) =>
      p.before.shadow_score != null &&
      p.after.shadow_score != null &&
      p.after.shadow_score - p.before.shadow_score <= -5,
  );
  const idealDrops = pairs.filter(
    (p) =>
      p.before.ideal_match_pct != null &&
      p.after.ideal_match_pct != null &&
      p.after.ideal_match_pct - p.before.ideal_match_pct <= -5,
  );

  const lines: string[] = [];
  const w = (s: string) => lines.push(s);

  w(`# QA Engineer — In-Depth FitScore Audit`);
  w("");
  w(`Generated: ${new Date().toISOString()}`);
  w(`Job: ${job?.title ?? "QA Engineer"} (\`${JOB_ID}\`)`);
  w(`Rescore date: ${RESCORE_DAY}`);
  w(`JD Base approved: ${jdBase?.approvedBy ? "yes" : "no"}`);
  if (jdBase?.weights) {
    w(`JD weights: ${JSON.stringify(jdBase.weights)}`);
  }
  w("");

  w(`## Executive summary`);
  w("");
  w(`| Metric | Value |`);
  w(`|--------|------:|`);
  w(`| Candidates with before/after pair | ${pairs.length} |`);
  w(`| Overall score changed | ${changed.length} |`);
  w(`| Unchanged | ${pairs.length - changed.length} |`);
  w(`| Band label changed | ${bandChanges.length} |`);
  w(`| Extraction validation warnings (log) | ${extractionFails.size} candidates |`);
  w(`| Shadow dropped ≥5 pts | ${shadowDrops.length} |`);
  w(`| Ideal match % dropped ≥5 | ${idealDrops.length} |`);
  if (changed.length) {
    const deltas = changed.map((p) => p.delta);
    const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    w(`| Avg delta (changed only) | ${avg.toFixed(1)} |`);
    w(
      `| Increased / decreased | ${deltas.filter((d) => d > 0).length} / ${deltas.filter((d) => d < 0).length} |`,
    );
  }
  w("");

  w(`## Root-cause signals`);
  w("");
  w(
    `Today's rescore used **hybrid_v2** (Claude Sonnet extraction+verdict). Score movement is driven by:`,
  );
  w("");
  w(
    `1. **Non-deterministic LLM re-extraction** — same JD Base, new model pass → dimension 1–10 scores shift.`,
  );
  w(
    `2. **Extraction quote validation fallbacks** — ${extractionFails.size} candidates hit quote/substring checks; engine uses sanitized/fallback extraction (logged as \`fitscore_extraction_validation_failed\`).`,
  );
  w(
    `3. **Shadow blend sensitivity** — ${shadowDrops.length} profiles lost ≥5 shadow points; overall score blends primary + shadow + ideal.`,
  );
  w(
    `4. **Ideal match % recalculation** — ${idealDrops.length} profiles lost ≥5 ICP % (essential checklist re-counted).`,
  );
  w("");

  w(`## Dimension-level aggregate impact (changed dimensions only)`);
  w("");
  w(`| Dimension | Net Δ (sum) | Profiles affected |`);
  w(`|-----------|-------------|------------------:|`);
  const dimSorted = Object.entries(dimImpact).sort(
    (a, b) => a[1].totalDrop + a[1].totalRise - (b[1].totalDrop + b[1].totalRise),
  );
  for (const [dim, stats] of dimSorted) {
    const net = stats.totalDrop + stats.totalRise;
    w(`| ${dim} | ${net >= 0 ? "+" : ""}${net.toFixed(1)} | ${stats.count} |`);
  }
  w("");

  w(`## Band changes (${bandChanges.length})`);
  w("");
  w(`| Candidate | Before | After | Δ |`);
  w(`|-----------|-------:|------:|--:|`);
  for (const p of bandChanges.sort((a, b) => a.delta - b.delta)) {
    w(
      `| ${p.name} | ${p.before.overall_score} (${p.before.band}) | ${p.after.overall_score} (${p.after.band}) | ${p.delta >= 0 ? "+" : ""}${p.delta} |`,
    );
  }
  w("");

  w(`## Top 15 movers (with dimension drivers)`);
  w("");
  for (const p of changed.slice(0, 15)) {
    w(
      `### ${p.name} — ${p.before.overall_score} → ${p.after.overall_score} (${p.delta >= 0 ? "+" : ""}${p.delta})`,
    );
    w(`- Email: ${p.email || "—"}`);
    w(`- Shadow: ${p.before.shadow_score} → ${p.after.shadow_score}`);
    w(`- Ideal %: ${p.before.ideal_match_pct} → ${p.after.ideal_match_pct}`);
    w(`- Confidence: ${p.before.confidence} → ${p.after.confidence}`);
    const dimStr = Object.entries(p.dimDeltas)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 5)
      .map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${v}`)
      .join(", ");
    w(`- Dimension shifts: ${dimStr || "none"}`);
    const fails = extractionFails.get(p.candidateId);
    if (fails?.length) w(`- Extraction warnings: ${fails.join("; ")}`);
    w("");
  }

  w(`## Validation set (8 held-out — not rescored today)`);
  w("");
  w(`| Candidate | Recruiter | Model | Δ | Band | Shadow | ICP % |`);
  w(`|-----------|----------:|------:|--:|------|-------:|------:|`);
  for (const v of validationRows) {
    const d =
      v.deltaRecruiter != null
        ? v.deltaRecruiter >= 0
          ? `+${v.deltaRecruiter}`
          : `${v.deltaRecruiter}`
        : "—";
    w(
      `| ${v.label} | ${v.recruiter} | ${v.score ?? "—"} | ${d} | ${v.band ?? "—"} | ${v.shadow ?? "—"} | ${v.ideal ?? "—"} |`,
    );
  }
  w("");
  const valErrors = validationRows.filter(
    (v) => v.deltaRecruiter != null && Math.abs(v.deltaRecruiter) > 15,
  );
  if (valErrors.length) {
    w(
      `**Calibration gaps (>15 vs recruiter):** ${valErrors.map((v) => `${v.label} (${v.deltaRecruiter! >= 0 ? "+" : ""}${v.deltaRecruiter})`).join(", ")}`,
    );
    w("");
  }

  w(`## Extraction validation failures (${extractionFails.size} candidates)`);
  w("");
  const failSorted = [...extractionFails.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [cid, reasons] of failSorted.slice(0, 20)) {
    const c = candById.get(cid);
    const name = c?.full_name ?? c?.name ?? cid.slice(0, 8);
    w(`- **${name}**: ${reasons.join("; ")}`);
  }
  if (failSorted.length > 20) w(`- … and ${failSorted.length - 20} more`);
  w("");

  w(`## Recommendations`);
  w("");
  w(
    `1. **Treat ±3–5 overall as noise** unless band changes — re-run \`compare-rescore-fitscores.ts --persist\` on borderline profiles to confirm spread.`,
  );
  w(
    `2. **Fix duplicate candidate records** (same name, different IDs) before recruiter review — inflates pipeline counts.`,
  );
  w(
    `3. **Re-calibrate validation set** if model vs recruiter gap >15 on held-out 8 — adjust JD Base strictness or blend weights, not one-off rescoring.`,
  );
  w(
    `4. **Tighten extraction quotes** for profiles with repeated \`quote is not a resume substring\` — often OCR/sparse PDF tier-2 resumes.`,
  );
  w(
    `5. **Lock scores for approved shortlist** — use \`superseded_at\` history; avoid bulk rescore after HM sign-off without explicit force.`,
  );
  w("");

  const outMd = path.resolve(process.cwd(), "scripts/output/qa-engineer-indepth-audit.md");
  const outCsv = path.resolve(
    process.cwd(),
    "scripts/output/qa-engineer-indepth-audit-dimensions.csv",
  );
  fs.writeFileSync(outMd, lines.join("\n") + "\n");

  const csvHeader =
    "candidate_id,name,email,overall_before,overall_after,delta,shadow_before,shadow_after,ideal_before,ideal_after,band_before,band_after,dim_deltas,extraction_warnings";
  const csvRows = pairs.map((p) =>
    [
      p.candidateId,
      JSON.stringify(p.name),
      JSON.stringify(p.email),
      p.before.overall_score ?? "",
      p.after.overall_score ?? "",
      p.delta,
      p.before.shadow_score ?? "",
      p.after.shadow_score ?? "",
      p.before.ideal_match_pct ?? "",
      p.after.ideal_match_pct ?? "",
      p.before.band ?? "",
      p.after.band ?? "",
      JSON.stringify(p.dimDeltas),
      JSON.stringify(extractionFails.get(p.candidateId) ?? []),
    ].join(","),
  );
  fs.writeFileSync(outCsv, [csvHeader, ...csvRows].join("\n") + "\n");

  console.log(`\nIn-depth audit written:\n  ${outMd}\n  ${outCsv}\n`);
  console.log(lines.slice(0, 35).join("\n"));
  console.log("\n… (see markdown for full report)\n");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
