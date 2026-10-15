/**
 * One-off live test of the WhatsApp screening interview loop, operator-requested.
 *
 * Run with PRODUCTION env (vercel env pull), against the Finstack TEST org only:
 *   npx tsx --env-file=/tmp/prodenv scripts/test-whatsapp-screening-live.ts
 *
 * Sends the screening intro + first question to the candidate phone via the real
 * WABA; the candidate's replies then flow through the production webhook.
 */
import { startCanonicalScreeningCollectionBestEffort } from "@/lib/whatsapp/screening-qa-flow";

const JOB_ID = "04f8c1d6-716b-46ea-a6da-428be17c0d48";
const CANDIDATE_ID = "bec07b7f-9a8c-46b0-ab68-bfae57f06d0c";
const APPLICATION_ID = "59b17374-61fe-43b0-b83b-3bbe3b75ed7c";
const ORG_ID = "1c77e437-3245-4bf6-a176-005ff3005d2d";

async function main() {
  const outcome = await startCanonicalScreeningCollectionBestEffort({
    jobId: JOB_ID,
    candidateId: CANDIDATE_ID,
    applicationId: APPLICATION_ID,
    organisationId: ORG_ID,
    phone: "+919885674488",
    source: "operator-live-test",
  });
  console.log("outcome:", outcome);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
