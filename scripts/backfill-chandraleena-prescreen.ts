/**
 * Confirm Chandraleena Ahmed resume match, update contact, send WhatsApp invite.
 *
 *   NODE_OPTIONS='--conditions=react-server' npx tsx --env-file=.env.local scripts/backfill-chandraleena-prescreen.ts --send
 */
import {
  normalizeEmailForCandidate,
  normalizePhoneForCandidate,
} from "@/lib/agents/candidate-dedup";
import { routePrescreenAfterApplication } from "@/lib/prescreen/channel-router";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const MASAI_ORG_ID = "8709084a-ed5c-4009-8f83-b724d56254e5";
const LEAD_BA_JOB_ID = "b863d72c-fc73-4842-8a9d-d5d84eff63e3";
const CANDIDATE_ID = "e6a0ee9d-79ef-4b77-9bea-2c6293dd0bde";

const CONTACT = {
  fullName: "Chandraleena Ahmed",
  email: "chandraleenaahmed@gmail.com",
  phone: "918876015433",
} as const;

const dryRun = !process.argv.includes("--send");

async function main() {
  const admin = createSupabaseAdmin();
  const phone = normalizePhoneForCandidate(CONTACT.phone);
  const email = normalizeEmailForCandidate(CONTACT.email);

  if (!phone || !email) throw new Error("Invalid contact");

  if (dryRun) {
    console.log("[dry-run] would update and send to", { ...CONTACT, phone, email });
    return;
  }

  const { error: updateError } = await admin
    .from("candidates")
    .update({
      full_name: CONTACT.fullName,
      name: CONTACT.fullName,
      phone,
      email,
    })
    .eq("id", CANDIDATE_ID);

  if (updateError) throw updateError;
  console.log("[updated]", CONTACT.fullName, phone, email);

  const outcome = await routePrescreenAfterApplication({
    admin,
    jobId: LEAD_BA_JOB_ID,
    candidateId: CANDIDATE_ID,
    organisationId: MASAI_ORG_ID,
    channel: "whatsapp",
    phone,
    options: {
      setGatePending: false,
      candidateFirstName: "Chandraleena",
      inviteTemplateName: "th_shortlisted",
      stage: "post_shortlist",
    },
  });

  console.log(outcome);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
