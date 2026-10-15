import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Args = {
  jobId?: string;
  candidateId?: string;
};

type FitScoreRow = {
  id: string;
  job_id: string;
  candidate_id: string;
  overall_score: number | null;
  confidence: string | null;
  verdict: string | null;
  verdict_action: string | null;
  one_line_summary: string | null;
  evidence_json: {
    quotes?: Array<{ dimension?: string; quote?: string; location_hint?: string }>;
  } | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (const arg of argv) {
    if (arg.startsWith("--job-id=")) args.jobId = arg.slice("--job-id=".length);
    if (arg.startsWith("--candidate-id=")) args.candidateId = arg.slice("--candidate-id=".length);
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

async function fetchTargetScore(supabase: SupabaseClient, args: Args): Promise<FitScoreRow | null> {
  let query = supabase
    .from("fit_scores")
    .select(
      "id, job_id, candidate_id, overall_score, confidence, verdict, verdict_action, one_line_summary, evidence_json",
    )
    .eq("scoring_version", 2)
    .eq("scoring_status", "scored")
    .or("is_test_run.eq.false,is_test_run.is.null")
    .is("superseded_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (args.jobId) query = query.eq("job_id", args.jobId);
  if (args.candidateId) query = query.eq("candidate_id", args.candidateId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data as FitScoreRow | null) ?? null;
}

async function fetchResumeText(
  supabase: SupabaseClient,
  candidateId: string,
): Promise<{ name: string; cvRawText: string }> {
  const { data, error } = await supabase
    .from("candidates")
    .select("name, full_name, cv_raw_text")
    .eq("id", candidateId)
    .maybeSingle();
  if (error) throw error;
  const row = (data ?? {}) as Record<string, unknown>;
  const name =
    (typeof row.full_name === "string" && row.full_name.trim()) ||
    (typeof row.name === "string" && row.name.trim()) ||
    "Unknown candidate";
  return {
    name,
    cvRawText: typeof row.cv_raw_text === "string" ? row.cv_raw_text : "",
  };
}

function quotePasses(quote: string, cvRawText: string): boolean {
  if (!quote || !cvRawText) return false;
  return cvRawText.includes(quote);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabase = createAdminClient();
  const score = await fetchTargetScore(supabase, args);

  if (!score) {
    console.log("No active production Hybrid v2 score found for the requested filter.");
    process.exitCode = 1;
    return;
  }

  const candidate = await fetchResumeText(supabase, score.candidate_id);
  const quotes = score.evidence_json?.quotes ?? [];
  const validation = quotes.map((entry) => {
    const dimension = (entry.dimension ?? "unknown").trim();
    const quote = (entry.quote ?? "").trim();
    const pass = quotePasses(quote, candidate.cvRawText);
    return { dimension, quote, pass };
  });

  const passCount = validation.filter((item) => item.pass).length;
  const failCount = validation.length - passCount;

  console.log("Hybrid v2 verdict-card internal review");
  console.log(`Fit score row: ${score.id}`);
  console.log(`Candidate: ${candidate.name} (${score.candidate_id})`);
  console.log(`Job: ${score.job_id}`);
  console.log(`Score: ${score.overall_score ?? "n/a"}`);
  console.log(`Confidence: ${score.confidence ?? "n/a"}`);
  console.log(`Verdict: ${score.verdict ?? "n/a"}`);
  console.log(`Verdict action: ${score.verdict_action ?? "n/a"}`);
  console.log(`Summary: ${score.one_line_summary ?? "n/a"}`);
  console.log("");
  console.log(`Evidence quotes: ${validation.length}`);
  console.log(`Substring validation: pass=${passCount}, fail=${failCount}`);
  for (const entry of validation) {
    console.log(`- [${entry.pass ? "PASS" : "FAIL"}] ${entry.dimension}: "${entry.quote}"`);
  }
  console.log("");
  console.log("Manual reviewer checklist:");
  console.log("1) Does the verdict action match the score and confidence?");
  console.log("2) Do the top quotes directly support the verdict rationale?");
  console.log("3) Any misleading or out-of-context quote usage?");

  if (failCount > 0) process.exitCode = 2;
}

void main().catch((error) => {
  const printable =
    error instanceof Error
      ? error.message
      : (() => {
          try {
            return JSON.stringify(error);
          } catch {
            return String(error);
          }
        })();
  console.error("Verdict card review failed:", printable);
  process.exit(1);
});
