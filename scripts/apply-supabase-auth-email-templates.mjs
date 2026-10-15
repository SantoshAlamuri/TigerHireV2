#!/usr/bin/env node
/**
 * Apply TigerHire-branded auth email templates to the linked Supabase project
 * via the Management API. Does not use the Supabase MCP (no auth-config tool).
 *
 * Requires:
 *   - SUPABASE_ACCESS_TOKEN (from https://supabase.com/dashboard/account/tokens)
 *   - SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL (project ref from https://<ref>.supabase.co)
 *
 * Run: npm run apply:auth-templates
 * Env can be in .env.local or: SUPABASE_ACCESS_TOKEN=xxx node scripts/apply-supabase-auth-email-templates.mjs
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Load .env.local so NEXT_PUBLIC_SUPABASE_URL and SUPABASE_ACCESS_TOKEN are available
function loadEnvLocal() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const SUPABASE_API = "https://api.supabase.com/v1";

const TIGERHIRE_TEMPLATES = {
  mailer_subjects_confirmation: "Confirm your TigerHire account",
  mailer_templates_confirmation_content: `<h2>Confirm your email</h2>
<p>Thanks for signing up for TigerHire. Click the link below to activate your account.</p>
<p><a href="{{ .ConfirmationURL }}">Confirm your email</a></p>
<p>If you didn't create an account with TigerHire, you can ignore this email.</p>
<p>— The TigerHire team</p>`,

  mailer_subjects_magic_link: "Your TigerHire login link",
  mailer_templates_magic_link_content: `<h2>Sign in to TigerHire</h2>
<p>Use the link below to sign in. It expires soon.</p>
<p><a href="{{ .ConfirmationURL }}">Sign in to TigerHire</a></p>
<p>If you didn't request this, you can ignore this email.</p>
<p>— The TigerHire team</p>`,

  mailer_subjects_recovery: "Reset your TigerHire password",
  mailer_templates_recovery_content: `<h2>Reset your password</h2>
<p>We received a request to reset the password for your TigerHire account. Click the link below to set a new password.</p>
<p><a href="{{ .ConfirmationURL }}">Reset password</a></p>
<p>If you didn't request this, you can ignore this email. Your password will stay the same.</p>
<p>— The TigerHire team</p>`,

  mailer_subjects_invite: "You're invited to TigerHire",
  mailer_templates_invite_content: `<h2>You're invited to TigerHire</h2>
<p>You've been invited to join TigerHire. Click the link below to accept and create your account.</p>
<p><a href="{{ .ConfirmationURL }}">Accept invite</a></p>
<p>— The TigerHire team</p>`,

  mailer_subjects_email_change: "Confirm your new email for TigerHire",
  mailer_templates_email_change_content: `<h2>Confirm your new email</h2>
<p>You requested to change the email for your TigerHire account. Click the link below to confirm.</p>
<p><a href="{{ .ConfirmationURL }}">Confirm new email</a></p>
<p>— The TigerHire team</p>`,

  mailer_subjects_reauthentication: "Your TigerHire verification code",
  mailer_templates_reauthentication_content: `<h2>Verification code</h2>
<p>Your code to continue: <strong>{{ .Token }}</strong></p>
<p>If you didn't request this, you can ignore this email.</p>
<p>— The TigerHire team</p>`,
};

function getProjectRef() {
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (ref) return ref;
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_INTERNAL_URL"]) {
    const url = process.env[key];
    if (url) {
      const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
      if (m) return m[1];
    }
  }
  return null;
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = getProjectRef();

  if (!token) {
    console.error(
      "Missing SUPABASE_ACCESS_TOKEN. Get a token from: https://supabase.com/dashboard/account/tokens",
    );
    process.exit(1);
  }
  if (!ref) {
    console.error(
      "Missing SUPABASE_PROJECT_REF. Set it or set NEXT_PUBLIC_SUPABASE_URL (e.g. https://<ref>.supabase.co)",
    );
    process.exit(1);
  }

  const res = await fetch(`${SUPABASE_API}/projects/${ref}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(TIGERHIRE_TEMPLATES),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Management API error:", res.status, res.statusText, text);
    process.exit(1);
  }

  console.log("TigerHire auth email templates applied successfully.");
}

main();
