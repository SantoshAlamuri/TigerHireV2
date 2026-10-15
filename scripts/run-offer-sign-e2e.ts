import crypto from "node:crypto";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { buildFrozenOfferLetterHtml, sha256HexOfUtf8 } from "@/lib/offers/offer-document-html";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
for (const name of [".env.local", ".env"]) {
  const loaded = config({ path: resolve(root, name) });
  if (loaded.parsed && Object.keys(loaded.parsed).length > 0) break;
}

const OFFER_ID = "f5000000-0000-0000-0000-000000000001"; // seeded "normal draft"
const recipientEmail = (process.argv[2] ?? "santoshsms@gmail.com").trim().toLowerCase();
const signerName = (process.argv[3] ?? "Santosh Test Sign").trim();
const shouldAutoSign = process.argv.includes("--auto-sign");

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!process.env.RESEND_API_KEY) {
    throw new Error("Missing RESEND_API_KEY");
  }
  if ((process.env.EMAIL_MODE ?? "").toLowerCase() === "sandbox") {
    throw new Error("EMAIL_MODE=sandbox; disable sandbox to send real email");
  }
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const resendFrom = process.env.RESEND_FROM_EMAIL ?? "noreply@app.tigerhire.io";
  const resend = new Resend(process.env.RESEND_API_KEY);

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );

  const { data: offerRow, error: offerError } = await admin
    .from("offers")
    .select(
      "id, organisation_id, application_id, created_by, role_title, start_date, compensation_json, notes, offer_pdf_template_id, letter_variables, applications(candidate_id)",
    )
    .eq("id", OFFER_ID)
    .single();
  if (offerError || !offerRow) {
    throw new Error(`Offer fixture missing: ${offerError?.message ?? "not found"}`);
  }

  const candidateId = (offerRow.applications as { candidate_id?: string } | null)?.candidate_id;
  if (!candidateId) {
    throw new Error("Offer fixture application has no candidate");
  }

  const { data: candidateRow, error: candError } = await admin
    .from("candidates")
    .update({ email: recipientEmail, full_name: signerName, name: signerName })
    .eq("id", candidateId)
    .select("id, email, name, full_name")
    .single();
  if (candError || !candidateRow) {
    throw new Error(`Failed to update candidate email: ${candError?.message ?? "unknown"}`);
  }

  const { data: orgRow } = await admin
    .from("organisations")
    .select("name")
    .eq("id", offerRow.organisation_id as string)
    .maybeSingle();
  const companyName = (orgRow?.name as string | null) ?? "Your organisation";

  const plainBody = [
    `Dear ${signerName},`,
    "",
    `We are pleased to offer you the role of ${(offerRow.role_title as string) ?? "Role"} at ${companyName}.`,
    `Proposed start date: ${(offerRow.start_date as string) ?? "to be confirmed"}.`,
    "",
    "Please review and sign this offer to confirm your acceptance.",
    "",
    "Regards,",
    `${companyName} Hiring Team`,
  ].join("\n");
  const documentContent = buildFrozenOfferLetterHtml({
    companyName,
    roleTitle: (offerRow.role_title as string) ?? "Role",
    plainBody,
  });
  const documentHash = sha256HexOfUtf8(documentContent);

  const publicToken = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const sentAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: offerUpdateError } = await admin
    .from("offers")
    .update({
      status: "sent",
      signing_status: "sent",
      sent_at: sentAt,
      responded_at: null,
      public_token: publicToken,
      expires_at: expiresAt,
      signer_name: null,
      signer_ip: null,
      signer_user_agent: null,
      signed_pdf_path: null,
      signed_at: null,
      document_content: documentContent,
      document_hash: documentHash,
      first_viewed_at: null,
      last_viewed_at: null,
      view_count: 0,
      last_signing_reminder_at: null,
    })
    .eq("id", OFFER_ID);
  if (offerUpdateError) {
    throw new Error(`Failed to prepare sent offer: ${offerUpdateError.message}`);
  }

  const signingUrl = `${baseUrl}/offers/${publicToken}`;
  const invite = await resend.emails.send({
    from: resendFrom,
    to: recipientEmail,
    subject: `Your offer from ${companyName} — ${(offerRow.role_title as string) ?? "Role"}`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#111">
        <h2>Your offer is ready</h2>
        <p>Hello ${signerName},</p>
        <p>Your offer for <strong>${(offerRow.role_title as string) ?? "Role"}</strong> at <strong>${companyName}</strong> is ready to review and sign.</p>
        <p><a href="${signingUrl}">Open and sign offer</a></p>
      </div>
    `,
  });
  if (invite.error) {
    throw new Error(`Failed to send invite email: ${invite.error.message}`);
  }

  console.log(`Invite sent to ${recipientEmail}`);
  console.log(`Invite email id: ${invite.data?.id ?? "unknown"}`);
  console.log(`Signing URL: ${signingUrl}`);

  let signOk = true;
  if (shouldAutoSign) {
    const signRes = await fetch(`${baseUrl}/api/offers/public/${publicToken}/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signer_name: signerName }),
    });
    const signBody = await signRes.json().catch(() => ({}));
    console.log(`Sign API status: ${signRes.status}`);
    console.log(`Sign API body: ${JSON.stringify(signBody)}`);
    signOk = signRes.ok;
  } else {
    console.log(
      "Auto-sign skipped. Open the signing URL from email to test user experience manually.",
    );
  }

  const { data: finalOffer, error: finalOfferErr } = await admin
    .from("offers")
    .select("id, status, signing_status, signed_at, sent_at, public_token")
    .eq("id", OFFER_ID)
    .single();
  if (finalOfferErr) {
    throw new Error(`Failed to read final offer status: ${finalOfferErr.message}`);
  }

  console.log(`Final offer status: ${JSON.stringify(finalOffer)}`);
  if (!signOk) {
    throw new Error("Signing failed");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
