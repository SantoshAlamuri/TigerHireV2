import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Args = {
  hours: number;
  minOrganicHybridPct: number;
  json: boolean;
};

type ScoreRow = {
  scoring_version: number | null;
  created_at: string;
  scoring_status: string | null;
  scoring_status_reason: string | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    hours: 24,
    minOrganicHybridPct: 80,
    json: false,
  };

  for (const arg of argv) {
    if (arg.startsWith("--hours=")) {
      const v = Number(arg.slice("--hours=".length));
      if (Number.isFinite(v) && v > 0) args.hours = v;
      continue;
    }
    if (arg.startsWith("--min-organic-hybrid-pct=")) {
      const v = Number(arg.slice("--min-organic-hybrid-pct=".length));
      if (Number.isFinite(v) && v >= 0 && v <= 100) args.minOrganicHybridPct = v;
      continue;
    }
    if (arg === "--json") args.json = true;
  }

  return args;
}

function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function startedAtIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function toPct(value: number, total: number): number {
  if (total <= 0) return 0;
  return Number(((value / total) * 100).toFixed(2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabase = createAdminClient();
  const sinceIso = startedAtIso(args.hours);

  const { data, error } = await supabase
    .from("fit_scores")
    .select("scoring_version, created_at, scoring_status, scoring_status_reason")
    .or("is_test_run.eq.false,is_test_run.is.null")
    .is("superseded_at", null)
    .gte("created_at", sinceIso);

  if (error) throw error;

  const rows = (data ?? []) as ScoreRow[];
  const total = rows.length;
  const hybrid = rows.filter((row) => Number(row.scoring_version ?? 1) >= 2);
  const legacy = rows.filter((row) => Number(row.scoring_version ?? 1) < 2);
  const backfillTagged = hybrid.filter((row) =>
    (row.scoring_status_reason ?? "").toLowerCase().includes("backfill"),
  );
  const organicHybrid = hybrid.length - backfillTagged.length;
  const organicHybridPct = toPct(organicHybrid, total);
  const hybridPct = toPct(hybrid.length, total);

  const report = {
    windowHours: args.hours,
    since: sinceIso,
    thresholdOrganicHybridPct: args.minOrganicHybridPct,
    total,
    hybridCount: hybrid.length,
    legacyCount: legacy.length,
    backfillTaggedHybridCount: backfillTagged.length,
    organicHybridCount: organicHybrid,
    hybridPct,
    organicHybridPct,
    thresholdPassed: organicHybridPct >= args.minOrganicHybridPct,
    notes: [
      "Organic hybrid currently excludes only rows explicitly tagged with 'backfill' in scoring_status_reason.",
      "If backfill tagging is absent in your environment, organicHybridPct effectively equals hybridPct.",
    ],
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("Hybrid v2 path-mix diagnostic");
    console.log(`Window: last ${report.windowHours}h (since ${report.since})`);
    console.log(`Total active production rows: ${report.total}`);
    console.log(`Hybrid v2 rows: ${report.hybridCount} (${report.hybridPct}%)`);
    console.log(`Legacy rows: ${report.legacyCount}`);
    console.log(`Backfill-tagged hybrid rows: ${report.backfillTaggedHybridCount}`);
    console.log(
      `Organic hybrid rows: ${report.organicHybridCount} (${report.organicHybridPct}%) [threshold >= ${report.thresholdOrganicHybridPct}%]`,
    );
    console.log(`Gate: ${report.thresholdPassed ? "PASS" : "FAIL"}`);
    for (const note of report.notes) console.log(`- ${note}`);
  }

  if (!report.thresholdPassed) process.exitCode = 2;
}

void main().catch((error) => {
  console.error(
    "Path-mix diagnostic failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
