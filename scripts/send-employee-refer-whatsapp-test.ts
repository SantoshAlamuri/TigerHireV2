/**
 * Exercise EmployeeService.refer → Meta WhatsApp (uses .env.local / linked Supabase).
 *
 *   NODE_OPTIONS='--conditions=react-server' npx tsx --env-file=.env.local scripts/send-employee-refer-whatsapp-test.ts [phone] [jobId]
 */
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { EmployeeService } from "@/lib/services/EmployeeService";
import { resolveReferrerIdForUser } from "@/lib/referrers/resolve-referrer-id";

const phone = process.argv[2] ?? "+919885674488";
const jobId = process.argv[3] ?? "861e8c58-9c72-4c46-8534-a02207a35cbc";
const userId = "32fe713c-08b2-4db0-9698-546aef59e656";
const orgId = "69005af4-82ad-436c-8798-5a271c03554e";

async function main() {
  const admin = createSupabaseAdmin();
  const directReferrerId = await resolveReferrerIdForUser(admin, userId);

  console.log("Sending employee referral WhatsApp…", {
    phone,
    jobId,
    referrer: userId,
    directReferrerId: directReferrerId ?? null,
  });

  const result = await EmployeeService.refer(
    admin,
    userId,
    orgId,
    {
      jobId,
      candidatePhone: phone,
      candidateName: "WhatsApp delivery test",
    },
    { directReferrerId },
  );

  console.log(JSON.stringify(result, null, 2));
  if (!result.whatsapp.reached) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
