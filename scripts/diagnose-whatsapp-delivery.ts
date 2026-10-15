/**
 * Check outbound log + try alternate UTILITY templates for a phone.
 * NODE_OPTIONS='--conditions=react-server' npx tsx --env-file=.env.local scripts/diagnose-whatsapp-delivery.ts +917569537492
 */
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendTemplateMessage } from "@/lib/services/whatsapp";
import { sendReferralUtilityFirstContact } from "@/lib/whatsapp/templates";

const phone = process.argv[2] ?? "+917569537492";
const digits = phone.replace(/\D/g, "");

async function main() {
  const admin = createSupabaseAdmin();

  const { data: logs } = await admin
    .from("whatsapp_message_log")
    .select("id, direction, wa_message_id, message_type, body_preview, created_at, metadata")
    .eq("phone", digits)
    .order("created_at", { ascending: false })
    .limit(15);

  console.log("=== whatsapp_message_log (latest) ===");
  console.log(JSON.stringify(logs, null, 2));

  const { data: inbound } = await admin
    .from("whatsapp_message_log")
    .select("id, created_at, body_preview")
    .eq("phone", digits)
    .eq("direction", "inbound")
    .limit(3);

  console.log("\n=== Has ever messaged TigerHire? ===", (inbound?.length ?? 0) > 0);

  console.log("\n=== Try th_application_received (known UTILITY fallback) ===");
  const fallback = await sendTemplateMessage({
    phoneNumber: digits,
    templateName: "th_application_received",
    languageCode: "en",
    bodyParams: ["there", "a role referred by a colleague", "TigerHire"],
  });
  console.log(JSON.stringify(fallback, null, 2));

  console.log("\n=== Try sendReferralUtilityFirstContact (employee refer path) ===");
  const refer = await sendReferralUtilityFirstContact(digits, "Test", "TigerHire Team");
  console.log(JSON.stringify(refer, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
