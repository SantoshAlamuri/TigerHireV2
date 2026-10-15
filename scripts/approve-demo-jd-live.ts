/**
 * One-off, operator-requested: approve the JD-Base for the Finstack DEMO job on
 * prod and queue the same background reconcile the approve API queues, so the
 * pending WhatsApp-screened pair gets scored. Mirrors
 * src/app/api/fitscore/jd-base/approve/route.ts exactly.
 *
 *   npx tsx --env-file=/tmp/prodenv scripts/approve-demo-jd-live.ts
 */
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getJdBaseByJobId, approveJdBase } from "@/lib/fitscore/hybrid";
import { enqueue } from "@/lib/jobs/queue";

const JOB_ID = "04f8c1d6-716b-46ea-a6da-428be17c0d48";
const ORG_ID = "1c77e437-3245-4bf6-a176-005ff3005d2d";

async function main() {
  const admin = createSupabaseAdmin();

  const { data: recruiter } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("organisation_id", ORG_ID)
    .in("role", ["recruiter", "leadership"])
    .limit(1)
    .maybeSingle();
  if (!recruiter) throw new Error("No Finstack recruiter/leadership profile found");
  console.log("approving as:", recruiter.full_name, recruiter.id);

  const existing = await getJdBaseByJobId(admin, JOB_ID);
  if (!existing) throw new Error("No jd_base_documents row for the demo job");
  console.log("jd-base:", existing.roleTitle, "approvedBy:", existing.approvedBy ?? "none");

  const doc = existing.approvedBy
    ? existing
    : await approveJdBase(admin, JOB_ID, recruiter.id as string, ORG_ID);
  console.log("approved:", doc.approvedBy, doc.approvedAt);

  const { id } = await enqueue(
    "jd-base-approval-reconcile",
    { jobId: JOB_ID, approvedByUserId: recruiter.id },
    { id: `jd-base-approval-reconcile:${JOB_ID}:${doc.version ?? 1}` },
  );
  console.log("reconcile queued:", id ?? "(no id)");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
