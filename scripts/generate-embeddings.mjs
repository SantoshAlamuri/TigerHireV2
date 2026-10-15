/**
 * One-time script to generate embeddings for all seed candidates and jobs.
 * Run: node --env-file=.env.local scripts/generate-embeddings.mjs
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!openaiKey) {
  console.error("Missing OPENAI_API_KEY — set it in .env.local");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MODEL = "text-embedding-3-small";
const DIMENSIONS = 1536;

async function embed(text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, input: text.slice(0, 8000), dimensions: DIMENSIONS }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data[0].embedding;
}

function candidateText(c) {
  const parts = [];
  if (c.name) parts.push(c.name);
  if (c.skills?.length) parts.push(`Skills: ${c.skills.join(", ")}`);
  if (c.experience_years) parts.push(`${c.experience_years} years experience`);
  if (c.location) parts.push(`Location: ${c.location}`);
  return parts.join(". ");
}

function jobText(j) {
  const parts = [j.title, j.description];
  if (j.location) parts.push(`Location: ${j.location}`);
  return parts.join(". ");
}

async function main() {
  console.log("=== Embedding Candidates ===");
  const { data: candidates } = await admin
    .from("candidates")
    .select("id, name, skills, experience_years, location")
    .is("profile_embedding", null);

  let ok = 0,
    fail = 0;
  for (const c of candidates ?? []) {
    const text = candidateText(c);
    if (!text.trim()) {
      console.log(`  skip ${c.id} (no text)`);
      continue;
    }
    try {
      const vec = await embed(text);
      await admin
        .from("candidates")
        .update({ profile_embedding: JSON.stringify(vec), updated_at: new Date().toISOString() })
        .eq("id", c.id);
      ok++;
      console.log(`  ✓ ${c.name ?? c.id}`);
    } catch (err) {
      fail++;
      console.error(`  ✗ ${c.id}: ${err.message}`);
    }
  }
  console.log(`Candidates: ${ok} embedded, ${fail} errors\n`);

  console.log("=== Embedding Jobs ===");
  const { data: jobs } = await admin
    .from("jobs")
    .select("id, title, description, location")
    .is("jd_embedding", null)
    .eq("status", "open");

  ok = 0;
  fail = 0;
  for (const j of jobs ?? []) {
    const text = jobText(j);
    try {
      const vec = await embed(text);
      await admin
        .from("jobs")
        .update({ jd_embedding: JSON.stringify(vec), updated_at: new Date().toISOString() })
        .eq("id", j.id);
      ok++;
      console.log(`  ✓ ${j.title}`);
    } catch (err) {
      fail++;
      console.error(`  ✗ ${j.id}: ${err.message}`);
    }
  }
  console.log(`Jobs: ${ok} embedded, ${fail} errors`);
  console.log("\nDone!");
}

main().catch(console.error);
