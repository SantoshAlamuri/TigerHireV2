/**
 * Seeds demo referrers, referral_links, and job_referral_config for local/staging E2E.
 *
 * Loads `.env.local` from the repo root (same pattern as other scripts).
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: NEXT_PUBLIC_APP_URL (default https://tigerhire.io)
 *
 * Usage: npm run seed:referral
 */

import dotenv from "dotenv";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://tigerhire.io").replace(/\/$/, "");
}

/** New opaque token for referral_links inserts only (not used to overwrite on conflict). */
function newLinkToken(): string {
  return Math.random().toString(36).slice(2, 12);
}

type SummaryRow = {
  referrer_name: string;
  referrer_type: string;
  job_title: string;
  token: string;
  apply_url: string;
};

type ReferrerUpsertRow = {
  name: string;
  type: "individual" | "agency";
  whatsapp_number: string;
  upi_id: string;
  status: "active";
  whatsapp_verified: boolean;
  parent_referrer_id: string | null;
};

/**
 * Idempotent by `whatsapp_number`: update existing row or insert.
 * Tries full portal columns first; falls back if `status` / `whatsapp_verified` are missing in DB.
 */
async function upsertReferrer(supabase: SupabaseClient, row: ReferrerUpsertRow): Promise<string> {
  const full = {
    name: row.name,
    type: row.type,
    whatsapp_number: row.whatsapp_number,
    upi_id: row.upi_id,
    status: row.status,
    whatsapp_verified: row.whatsapp_verified,
    parent_referrer_id: row.parent_referrer_id,
  };
  const legacy = {
    name: row.name,
    type: row.type,
    whatsapp_number: row.whatsapp_number,
    upi_id: row.upi_id,
    parent_referrer_id: row.parent_referrer_id,
  };

  const { data: existing } = await supabase
    .from("referrers")
    .select("id")
    .eq("whatsapp_number", row.whatsapp_number)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const id = existing.id as string;
    let { error } = await supabase.from("referrers").update(full).eq("id", id);
    const msg = error?.message ?? "";
    if (error && (msg.includes("status") || msg.includes("whatsapp_verified"))) {
      ({ error } = await supabase.from("referrers").update(legacy).eq("id", id));
    }
    if (error) throw new Error(`referrers update (${row.whatsapp_number}): ${error.message}`);
    return id;
  }

  let { data: inserted, error: insErr } = await supabase
    .from("referrers")
    .insert(full)
    .select("id")
    .single();
  const insMsg = insErr?.message ?? "";
  if (insErr && (insMsg.includes("status") || insMsg.includes("whatsapp_verified"))) {
    ({ data: inserted, error: insErr } = await supabase
      .from("referrers")
      .insert(legacy)
      .select("id")
      .single());
  }
  if (insErr || !inserted?.id) {
    throw new Error(`referrers insert (${row.whatsapp_number}): ${insErr?.message ?? "no id"}`);
  }
  return inserted.id as string;
}

/**
 * Ensures a referral_links row for (referrer_id, job_id).
 * Prefers upsert with ON CONFLICT DO NOTHING (composite unique) when present;
 * otherwise select-then-insert so existing tokens are never overwritten.
 */
async function ensureReferralLink(
  supabase: SupabaseClient,
  referrerId: string,
  jobId: string,
): Promise<string> {
  const { data: existing, error: sel0 } = await supabase
    .from("referral_links")
    .select("token")
    .eq("referrer_id", referrerId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (sel0) throw new Error(`referral_links read: ${sel0.message}`);
  if (existing?.token) return existing.token as string;

  const candidateToken = newLinkToken();
  const { error: upErr } = await supabase
    .from("referral_links")
    .upsert(
      { referrer_id: referrerId, job_id: jobId, token: candidateToken },
      { onConflict: "referrer_id,job_id", ignoreDuplicates: true },
    );

  if (upErr?.message?.includes("no unique or exclusion constraint")) {
    const { error: insErr } = await supabase.from("referral_links").insert({
      referrer_id: referrerId,
      job_id: jobId,
      token: candidateToken,
    });
    const pgCode = (insErr as { code?: string } | null)?.code;
    if (insErr && pgCode !== "23505") throw new Error(`referral_links insert: ${insErr.message}`);
  } else if (upErr) {
    throw new Error(`referral_links upsert: ${upErr.message}`);
  }

  const { data: row, error: selErr } = await supabase
    .from("referral_links")
    .select("token")
    .eq("referrer_id", referrerId)
    .eq("job_id", jobId)
    .single();

  if (selErr || !row?.token) {
    throw new Error(`referral_links read token: ${selErr?.message ?? "missing row"}`);
  }
  return row.token as string;
}

function printSummaryTable(rows: SummaryRow[], slug: string): void {
  const colReferrer = "Referrer";
  const colType = "Type";
  const colJob = "Job Title";
  const colToken = "Token";
  const colUrl = "Apply URL";

  const wRef = Math.max(colReferrer.length, ...rows.map((r) => r.referrer_name.length));
  const wType = Math.max(colType.length, ...rows.map((r) => r.referrer_type.length));
  const wJob = Math.max(colJob.length, ...rows.map((r) => r.job_title.length));
  const wTok = Math.max(colToken.length, ...rows.map((r) => r.token.length));

  const pad = (s: string, w: number) => s.padEnd(w);
  const sep = ` ${"|"} `;

  console.log(
    `${pad(colReferrer, wRef)}${sep}${pad(colType, wType)}${sep}${pad(colJob, wJob)}${sep}${pad(colToken, wTok)}${sep}${colUrl}`,
  );
  console.log(
    `${"-".repeat(wRef)}${sep}${"-".repeat(wType)}${sep}${"-".repeat(wJob)}${sep}${"-".repeat(wTok)}${sep}${"-".repeat(20)}`,
  );
  for (const r of rows) {
    console.log(
      `${pad(r.referrer_name, wRef)}${sep}${pad(r.referrer_type, wType)}${sep}${pad(r.job_title, wJob)}${sep}${pad(r.token, wTok)}${sep}${r.apply_url}`,
    );
  }
  console.log(`\nOrganisation slug: ${slug}`);
}

async function main(): Promise<void> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const base = appBaseUrl();

  const { data: org, error: orgErr } = await supabase
    .from("organisations")
    .select("id, slug, name, email_domain")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (orgErr) {
    console.error("Failed to read organisations:", orgErr.message);
    process.exit(1);
  }
  if (!org?.id) {
    console.log("No organisation found in `organisations`. Nothing to seed.");
    return;
  }

  const orgName = (org.name as string) ?? "(unnamed)";
  console.log(`Organisation: ${orgName}`);

  const orgId = org.id as string;
  const slug = (org.slug as string) || "demo";
  const existingEmailDomain = (org.email_domain as string | null) ?? null;

  if (!existingEmailDomain || existingEmailDomain.trim() === "") {
    const { error: orgUpdateErr } = await supabase
      .from("organisations")
      .update({ email_domain: "enate.ai" })
      .eq("id", orgId);
    if (orgUpdateErr) {
      throw new Error(`organisations update email_domain: ${orgUpdateErr.message}`);
    }
  }

  const { data: jobs, error: jobsErr } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("organisation_id", orgId)
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(3);

  if (jobsErr) {
    console.error("Failed to read jobs:", jobsErr.message);
    process.exit(1);
  }
  if (!jobs?.length) {
    console.log("No open jobs for this organisation. Nothing to seed.");
    return;
  }

  const agencyId = await upsertReferrer(supabase, {
    name: "Tiger Agency",
    type: "agency",
    whatsapp_number: "919000000001",
    upi_id: "tigergency@upi",
    status: "active",
    whatsapp_verified: true,
    parent_referrer_id: null,
  });

  const priyaId = await upsertReferrer(supabase, {
    name: "Priya Sharma",
    type: "individual",
    whatsapp_number: "919000000002",
    upi_id: "priya.sharma@upi",
    status: "active",
    whatsapp_verified: true,
    parent_referrer_id: agencyId,
  });

  const { error: priyaUpdateErr } = await supabase
    .from("referrers")
    .update({
      work_email: "priya@enate.ai",
      verified_org_id: orgId,
      org_verified: true,
    })
    .eq("id", priyaId);
  if (priyaUpdateErr) {
    throw new Error(`referrers update Priya work_email: ${priyaUpdateErr.message}`);
  }

  const arjunId = await upsertReferrer(supabase, {
    name: "Arjun Mehta",
    type: "individual",
    whatsapp_number: "919000000003",
    upi_id: "arjun.mehta@upi",
    status: "active",
    whatsapp_verified: true,
    parent_referrer_id: null,
  });

  const referrers = [
    { id: agencyId, name: "Tiger Agency", type: "agency" },
    { id: priyaId, name: "Priya Sharma", type: "individual" },
    { id: arjunId, name: "Arjun Mehta", type: "individual" },
  ];

  const summary: SummaryRow[] = [];

  for (const ref of referrers) {
    for (const job of jobs) {
      const jobId = job.id as string;
      const jobTitle = (job.title as string) || "Job";
      const token = await ensureReferralLink(supabase, ref.id, jobId);
      const applyUrl = `${base}/apply/${encodeURIComponent(slug)}?job=${encodeURIComponent(jobId)}&ref=${encodeURIComponent(token)}`;
      summary.push({
        referrer_name: ref.name,
        referrer_type: ref.type,
        job_title: jobTitle,
        token,
        apply_url: applyUrl,
      });
    }
  }

  const firstJobId = jobs[0].id as string;
  const cfgFull = {
    job_id: firstJobId,
    direct_bonus_amount: 15000,
    parent_bonus_amount: 5000,
    candidate_referrer_bonus_amount: 8000,
    bonus_trigger: "offer_accepted" as const,
    candidate_referrer_enabled: true,
    vouch_bonus_amount: 0,
  };
  const cfgLegacy = {
    job_id: firstJobId,
    direct_bonus_amount: 15000,
    parent_bonus_amount: 5000,
    bonus_trigger: "offer_accepted" as const,
  };

  let { error: cfgErr } = await supabase
    .from("job_referral_config")
    .upsert(cfgFull, { onConflict: "job_id" });
  const cfgMsg = cfgErr?.message ?? "";
  if (cfgErr && (cfgMsg.includes("candidate_referrer") || cfgMsg.includes("vouch_bonus"))) {
    ({ error: cfgErr } = await supabase
      .from("job_referral_config")
      .upsert(cfgLegacy, { onConflict: "job_id" }));
  }
  if (cfgErr) throw new Error(`job_referral_config: ${cfgErr.message}`);

  console.log(`\nOpen jobs used: ${jobs.length} (max 3)\n`);
  printSummaryTable(summary, slug);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
