/**
 * One-off, operator-requested: open the WhatsApp conversation for the live
 * screening test using the approved UTILITY template th_application_received
 * (business-initiated messages outside the 24h window require a template; the
 * marketing-consent guard rightly blocks marketing templates, utility is the
 * correct class for an existing application).
 *
 *   npx tsx --env-file=/tmp/prodenv scripts/send-screening-opener-live.ts
 */
import { sendTemplateWithFallback } from "@/lib/whatsapp/template-send-fallback";

async function main() {
  const result = await sendTemplateWithFallback({
    phone: "+919885674488",
    templateNames: ["th_application_received"],
    bodyParams: ["Santosh", "Demo JD for Hiring Manager", "Finstack"],
  });
  console.log(JSON.stringify(result, null, 2));
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
