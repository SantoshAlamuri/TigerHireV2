/**
 * Verify employee referral board shows WhatsApp referrals for a phone.
 * NODE_OPTIONS='--conditions=react-server' npx tsx --env-file=.env.local scripts/verify-employee-referral-board.ts [phoneDigits]
 */
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { EmployeeReferralBoardService } from "@/lib/services/EmployeeReferralBoardService";

const userId = "32fe713c-08b2-4db0-9698-546aef59e656";
const orgId = "69005af4-82ad-436c-8798-5a271c03554e";
const phone = (process.argv[2] ?? "7569537492").replace(/\D/g, "");

async function main() {
  const admin = createSupabaseAdmin();
  const board = await EmployeeReferralBoardService.getBoard(
    admin,
    userId,
    orgId,
    "https://tigerhire.io",
  );

  const waRows = board.referrals.filter(
    (r) =>
      r.channel === "whatsapp" &&
      (r.candidate_phone?.includes(phone) || r.candidate_name.includes("WhatsApp delivery")),
  );

  const { data: dbRows } = await admin
    .from("employee_referrals")
    .select("id, status, candidate_phone, created_at")
    .eq("referrer_id", userId)
    .ilike("candidate_phone", `%${phone}%`)
    .order("created_at", { ascending: false })
    .limit(5);

  console.log(
    JSON.stringify(
      {
        env: {
          WHATSAPP_MODE: process.env.WHATSAPP_MODE,
          OUTBOUND_NOTIFICATIONS_ENABLED: process.env.OUTBOUND_NOTIFICATIONS_ENABLED,
        },
        board_matches: waRows,
        db_latest: dbRows,
        board_stats: {
          total_referrals: board.referrals.length,
          hired_count: board.hired_count,
        },
      },
      null,
      2,
    ),
  );

  if (waRows.length === 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
