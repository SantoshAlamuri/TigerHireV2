import { createClient } from "@supabase/supabase-js";
import { env } from "../src/lib/config/env";

function getArg(name: string): string | null {
  const idx = process.argv.findIndex((arg) => arg === name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

async function main() {
  const emailArg = getArg("--email");
  const confirmArg = getArg("--confirm");
  if (!emailArg) {
    console.error("Missing required flag: --email");
    process.exit(1);
  }
  const email = emailArg.trim().toLowerCase();
  if (!email.includes("@")) {
    console.error("Invalid email");
    process.exit(1);
  }
  if (!confirmArg || confirmArg.trim().toLowerCase() !== email) {
    console.error(
      `Confirmation required. Re-run with --confirm ${email} to grant platform admin access.`,
    );
    process.exit(1);
  }

  const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: users, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) {
    console.error("Failed to list auth users");
    process.exit(1);
  }
  const authUser = (users.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email);
  if (!authUser?.id) {
    console.error(`No auth user found for ${email}`);
    process.exit(1);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, role_status, is_platform_admin")
    .eq("id", authUser.id)
    .maybeSingle();
  if (profileError) {
    console.error("Failed to read target profile");
    process.exit(1);
  }
  if (!profile) {
    console.error("Target auth user has no profile row");
    process.exit(1);
  }

  console.log(
    `Promoting ${email} (current role=${profile.role ?? "null"}, role_status=${profile.role_status ?? "unknown"}, is_platform_admin=${Boolean(profile.is_platform_admin)})`,
  );

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ is_platform_admin: true, updated_at: new Date().toISOString() })
    .eq("id", authUser.id);
  if (updateError) {
    console.error("Failed to grant platform admin");
    process.exit(1);
  }

  console.log(`Platform admin granted for ${email}`);
}

main().catch(() => {
  console.error("Unexpected error while granting platform admin");
  process.exit(1);
});
