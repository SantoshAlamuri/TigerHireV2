#!/usr/bin/env node
/**
 * Send a test auth email via Supabase to verify TigerHire SMTP and templates.
 * Usage: node scripts/send-test-auth-email.mjs [type] [email]
 *   type:  magic-link (default), reset, signup
 *   email: defaults to santoshsms@gmail.com
 * Loads .env.local for SUPABASE_INTERNAL_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

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

const type = process.argv[2] || "magic-link";
const email = process.argv[3] || "santoshsms@gmail.com";
const url = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error(
    "Missing SUPABASE_INTERNAL_URL/NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
  );
  process.exit(1);
}

const supabase = createClient(url, anonKey);
const redirectTo = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

let result;

switch (type) {
  case "reset": {
    result = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    break;
  }
  case "signup": {
    const pw = `Test_${Date.now()}!`;
    result = await supabase.auth.signUp({
      email,
      password: pw,
      options: { emailRedirectTo: redirectTo },
    });
    break;
  }
  case "magic-link":
  default: {
    result = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    break;
  }
}

if (result.error) {
  console.error(`Failed to send ${type} email:`, result.error.message);
  console.error(
    "Tip: In Supabase Dashboard → Authentication → URL Configuration, add this redirect URL (or your app URL).",
  );
  process.exit(1);
}

console.log(`Test "${type}" email sent to ${email}`);
console.log("Check the inbox (and spam) for the TigerHire-branded email.");
