import { sendEmail } from "@/lib/services/resend";
import { env } from "@/lib/config/env";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function consultantInviteUrl(token: string): string {
  const base = env.baseUrl || "https://tigerhire.io";
  return `${base.replace(/\/$/, "")}/consultant-invite/${token}`;
}

export function consultantInviteHtml(params: {
  companyName: string;
  inviterName: string;
  note?: string | null;
  token: string;
}): string {
  const url = consultantInviteUrl(params.token);
  const company = escapeHtml(params.companyName);
  const inviter = escapeHtml(params.inviterName);
  const note = params.note?.trim()
    ? `<p style="margin:16px 0;padding:12px 16px;border-left:3px solid #f59e0b;background:#fffbeb;color:#78350f;">${escapeHtml(params.note.trim())}</p>`
    : "";

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#111827;">
    <h1 style="font-size:20px;margin:0 0 16px;">${company} invited your firm to work on their roles</h1>
    <p style="margin:0 0 12px;line-height:1.6;">
      ${inviter} at ${company} has invited your firm to collaborate on their hiring in TigerHire.
    </p>
    ${note}
    <p style="margin:0 0 12px;line-height:1.6;">
      Accepting gives your firm access to ${company}'s open roles and the candidates you submit for them.
      Your firm keeps its own workspace, team and candidate pool — nothing of yours is shared with ${company}.
    </p>
    <p style="margin:24px 0;">
      <a href="${url}" style="display:inline-block;background:#f59e0b;color:#111827;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;">
        Review this invitation
      </a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280;line-height:1.6;">
      This invitation expires in 14 days. ${company} can revoke it at any time, and you can leave later from your Clients page.
    </p>
    <p style="margin:0;font-size:13px;color:#6b7280;">
      If you weren't expecting this, you can ignore this email — nothing happens until you accept.
    </p>
  </div>`;
}

export async function sendConsultantInviteEmail(params: {
  email: string;
  companyName: string;
  inviterName: string;
  note?: string | null;
  token: string;
}) {
  return sendEmail({
    to: params.email,
    subject: `${params.companyName} invited your firm to work on their roles`,
    html: consultantInviteHtml(params),
  });
}
