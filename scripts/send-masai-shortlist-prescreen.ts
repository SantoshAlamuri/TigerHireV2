/**
 * Masai School: one-time backfill script — prefer the in-app Screening tab
 * "Send to shortlisted" button for normal operations.
 *
 *   npx tsx --env-file=.env.local scripts/send-masai-shortlist-prescreen.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/send-masai-shortlist-prescreen.ts --send
 *
 * All recruiter-uploaded candidates with phone:
 *   npx tsx --env-file=.env.local scripts/send-masai-shortlist-prescreen.ts --all-uploaded --dry-run
 *   npx tsx --env-file=.env.local scripts/send-masai-shortlist-prescreen.ts --all-uploaded --send
 *
 * Use NODE_OPTIONS='--conditions=react-server' if imports fail.
 */
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { routePrescreenAfterApplication } from "@/lib/prescreen/channel-router";
import { getSession } from "@/lib/prescreen/repository";

const MASAI_ORG_ID = "8709084a-ed5c-4009-8f83-b724d56254e5";
const LEAD_BA_JOB_ID = "b863d72c-fc73-4842-8a9d-d5d84eff63e3";

const dryRun = !process.argv.includes("--send");
const allUploaded = process.argv.includes("--all-uploaded");
const STAGE = "post_shortlist" as const;

type CandidateRow = {
  candidateId: string;
  fullName: string;
  phone: string | null;
};

async function loadShortlisted(
  admin: ReturnType<typeof createSupabaseAdmin>,
): Promise<CandidateRow[]> {
  const { data: stageRow } = await admin
    .from("pipeline_stages")
    .select("id")
    .eq("job_id", LEAD_BA_JOB_ID)
    .ilike("stage_name", "%shortlist%")
    .maybeSingle();

  if (!stageRow?.id) {
    throw new Error("No Shortlisted stage found for Lead Business Analyst");
  }

  const { data: rows, error } = await admin
    .from("pipeline_candidates")
    .select("candidate_id, candidates(id, full_name, name, phone)")
    .eq("job_id", LEAD_BA_JOB_ID)
    .eq("stage_id", stageRow.id);

  if (error) throw error;

  return (rows ?? []).map((row) => {
    const r = row as {
      candidate_id: string;
      candidates: {
        id: string;
        full_name: string | null;
        name: string | null;
        phone: string | null;
      };
    };
    return {
      candidateId: r.candidate_id,
      fullName: r.candidates?.full_name ?? r.candidates?.name ?? r.candidate_id,
      phone: r.candidates?.phone ?? null,
    };
  });
}

async function loadAllUploaded(
  admin: ReturnType<typeof createSupabaseAdmin>,
): Promise<CandidateRow[]> {
  const { data: rows, error } = await admin
    .from("applications")
    .select("candidate_id, candidates(id, full_name, name, phone)")
    .eq("job_id", LEAD_BA_JOB_ID)
    .eq("source", "recruiter_upload");

  if (error) throw error;

  const byId = new Map<string, CandidateRow>();
  for (const row of rows ?? []) {
    const r = row as {
      candidate_id: string;
      candidates: {
        id: string;
        full_name: string | null;
        name: string | null;
        phone: string | null;
      };
    };
    byId.set(r.candidate_id, {
      candidateId: r.candidate_id,
      fullName: r.candidates?.full_name ?? r.candidates?.name ?? r.candidate_id,
      phone: r.candidates?.phone ?? null,
    });
  }
  return [...byId.values()];
}

async function main() {
  const admin = createSupabaseAdmin();
  const candidates = allUploaded ? await loadAllUploaded(admin) : await loadShortlisted(admin);

  const withPhone = candidates.filter((c) => c.phone?.trim());
  const withoutPhone = candidates.filter((c) => !c.phone?.trim());

  console.log(
    JSON.stringify(
      {
        dryRun,
        scope: allUploaded ? "all_uploaded" : "shortlisted",
        total: candidates.length,
        withPhone: withPhone.length,
        withoutPhone: withoutPhone.length,
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    console.log("Sample (first 5 with phone):");
    for (const c of withPhone.slice(0, 5)) {
      console.log(`  - ${c.fullName} (${c.phone})`);
    }
    console.log("\nRe-run with --send to dispatch WhatsApp messages.");
    return;
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of withPhone) {
    const existing = await getSession(admin, LEAD_BA_JOB_ID, c.candidateId, STAGE);
    if (existing && existing.state !== "complete") {
      skipped += 1;
      continue;
    }

    const firstName = c.fullName?.trim()?.split(/\s+/)[0] ?? null;

    try {
      const outcome = await routePrescreenAfterApplication({
        admin,
        jobId: LEAD_BA_JOB_ID,
        candidateId: c.candidateId,
        organisationId: MASAI_ORG_ID,
        channel: "whatsapp",
        phone: c.phone,
        options: {
          setGatePending: false,
          candidateFirstName: firstName,
          inviteTemplateName: "th_shortlisted",
          stage: STAGE,
        },
      });
      if (outcome.started) {
        sent += 1;
        if (sent % 10 === 0 || sent === withPhone.length) {
          console.log(`[progress] ${sent}/${withPhone.length} invites queued (${c.fullName})`);
        }
      } else {
        skipped += 1;
        console.warn("Skipped", c.fullName, outcome.reason);
      }
    } catch (err) {
      failed += 1;
      console.error("Failed", c.fullName, err);
    }
  }

  console.log(
    JSON.stringify({ sent, skipped, failed, withoutPhone: withoutPhone.length }, null, 2),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
