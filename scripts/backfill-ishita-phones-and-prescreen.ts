/**
 * Backfill phones from Ishita's Excel for shortlisted Lead BA candidates missing
 * contact info, then send post-shortlist WhatsApp invites.
 *
 *   NODE_OPTIONS='--conditions=react-server' npx tsx --env-file=.env.local scripts/backfill-ishita-phones-and-prescreen.ts --dry-run
 *   NODE_OPTIONS='--conditions=react-server' npx tsx --env-file=.env.local scripts/backfill-ishita-phones-and-prescreen.ts --send
 */
import {
  normalizeEmailForCandidate,
  normalizePhoneForCandidate,
} from "@/lib/agents/candidate-dedup";
import { routePrescreenAfterApplication } from "@/lib/prescreen/channel-router";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const MASAI_ORG_ID = "8709084a-ed5c-4009-8f83-b724d56254e5";
const LEAD_BA_JOB_ID = "b863d72c-fc73-4842-8a9d-d5d84eff63e3";
const STAGE = "post_shortlist" as const;

/** Matched from Data for Tigerhire.xlsx on 2026-07-07 */
const BACKFILL = [
  {
    candidateId: "50e52834-1f04-438a-962a-f0baa00e606c",
    dbName: "114 Amit Pandit",
    email: "amit.p257@gmail.com",
    phone: "917411822871",
  },
  {
    candidateId: "2baf8e28-1a68-412c-90cc-596f6f29b9e9",
    dbName: "Ashvin Ramteke",
    email: "ramtekeashvin18@gmail.com",
    phone: "918668596095",
  },
  {
    candidateId: "02b0194a-adc5-4f15-8cad-011acf91e857",
    dbName: "394 Rishabh Jain",
    email: "rish7.jain@gmail.com",
    phone: "917005114153",
  },
  {
    candidateId: "f8a38de5-ea20-4309-898b-5c19eb77dd9d",
    dbName: "Sharath Suryan",
    email: "official.sharath@gmail.com",
    phone: "919686106198",
  },
  {
    candidateId: "53213a3c-2a6e-441e-a1a7-658f754a61b9",
    dbName: "363 Shubham Saluja",
    email: "shubham.saluja21@gmail.com",
    phone: "917297947781",
  },
  {
    candidateId: "42dc5b2a-d41d-4e5f-a565-fa6b1ae81cae",
    dbName: "228 Surya Dey Resume",
    email: "suryadey0417@gmail.com",
    phone: "919438471545",
  },
  {
    candidateId: "482f49e6-053b-4d05-83b7-50537ae2561b",
    dbName: "PANKHURI",
    email: "pankhuri2349@gmail.com",
    phone: "918884896179",
  },
  {
    candidateId: "9c71f89b-e62f-4014-a51b-7b68bb0bf27b",
    dbName: "299 Puneet Gupta",
    email: "kumarpuneet56@gmail.com",
    phone: "918217606305",
  },
  {
    candidateId: "d3ad4076-31f6-4569-9dd7-2617640098d1",
    dbName: "226 Kartikey Tripathi",
    email: "kartikeytripi@gmail.com",
    phone: "918447472638",
  },
  {
    candidateId: "0c06e31d-01d2-49f5-81e8-0793a4da9ced",
    dbName: "083 Utkarsh Pande",
    email: "utkpande95@gmail.com",
    phone: "919629782939",
  },
  {
    candidateId: "48fa221a-951b-4159-b0f2-d599201e0793",
    dbName: "051 Ujwal Kumar",
    email: "crazyujwal0399@gmail.com",
    phone: "919902096690",
  },
  {
    candidateId: "b1a1179e-c908-4c0f-9e3c-e9253814414a",
    dbName: "034 Manju T",
    email: "tkmanju96@gmail.com",
    phone: "919677328238",
  },
] as const;

const dryRun = !process.argv.includes("--send");

async function main() {
  const admin = createSupabaseAdmin();
  let updated = 0;
  let sent = 0;
  let failed = 0;

  console.log(JSON.stringify({ dryRun, total: BACKFILL.length }, null, 2));

  for (const row of BACKFILL) {
    const phone = normalizePhoneForCandidate(row.phone);
    const email = normalizeEmailForCandidate(row.email);
    if (!phone || !email) {
      console.warn("Skip invalid contact", row.dbName);
      failed += 1;
      continue;
    }

    const firstName =
      row.dbName
        .replace(/^\d+\s+/, "")
        .trim()
        .split(/\s+/)[0] ?? null;

    if (dryRun) {
      console.log(`[dry-run] ${row.dbName} → phone=${phone} email=${email}`);
      continue;
    }

    const { error: updateError } = await admin
      .from("candidates")
      .update({ phone, email })
      .eq("id", row.candidateId);

    if (updateError) {
      console.error("Update failed", row.dbName, updateError.message);
      failed += 1;
      continue;
    }
    updated += 1;
    console.log(`[updated] ${row.dbName} → ${phone}`);

    try {
      const outcome = await routePrescreenAfterApplication({
        admin,
        jobId: LEAD_BA_JOB_ID,
        candidateId: row.candidateId,
        organisationId: MASAI_ORG_ID,
        channel: "whatsapp",
        phone,
        options: {
          setGatePending: false,
          candidateFirstName: firstName,
          inviteTemplateName: "th_shortlisted",
          stage: STAGE,
        },
      });

      if (outcome.started) {
        sent += 1;
        console.log(`[sent] ${row.dbName}`);
      } else {
        failed += 1;
        console.warn(`[not sent] ${row.dbName}: ${outcome.reason}`);
      }
    } catch (err) {
      failed += 1;
      console.error(`[send error] ${row.dbName}`, err);
    }
  }

  console.log(JSON.stringify({ dryRun, updated, sent, failed }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
