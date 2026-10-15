/**
 * Run Finstack seed (candidates, jobs, applications, fit_scores, pipeline).
 * Requires dev server running: npm run dev
 * Run after seed-demo-users so Finstack org and demo users exist.
 *
 * Usage: node scripts/seed-finstack.mjs
 *    or: npm run seed:finstack
 */
const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

async function main() {
  console.log("Seeding Finstack data at", base, "...");
  const res = await fetch(`${base}/api/seed/finstack`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  let data = {};
  try {
    const text = await res.text();
    data = text ? JSON.parse(text) : {};
  } catch {
    // ignore
  }
  if (!res.ok) {
    console.error("Seed failed:", res.status, data.error || "Unknown error");
    if (data.detail) console.error("Detail:", data.detail);
    process.exit(1);
  }
  if (data.alreadySeeded) {
    console.log("OK:", data.message);
    return;
  }
  console.log("OK:", data.message);
  console.log("  Jobs:", data.jobsCreated);
  console.log("  Candidates:", data.candidatesCreated);
  console.log("  Applications:", data.applicationsCreated);
  console.log("  Fit scores:", data.fitScoresCreated);
  console.log(
    "  Pipeline stages/candidates:",
    data.pipelineStagesCreated,
    "/",
    data.pipelineCandidatesCreated,
  );
  console.log("\nTest candidate flow:");
  console.log("  • priya.sharma@gmail.com (candidate_pro) — Match Feed + My Applications");
  console.log(
    "  • siddharth.patil@outlook.com (candidate_free) — Match Feed (top 3) + My Applications",
  );
  console.log("  Password: demo123 (or SEED_DEMO_PASSWORD)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
