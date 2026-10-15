import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run with: node --env-file=.env.local scripts/seed-platform-admin.mjs",
  );
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@tigerhire.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!@#";
const ADMIN_NAME = process.env.ADMIN_NAME || "Platform Admin";

async function seedPlatformAdmin() {
  console.log(`\n🔧 Creating platform admin: ${ADMIN_EMAIL}\n`);

  const {
    data: { users },
  } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());

  let userId;

  if (existing) {
    console.log(`  Auth user exists (${existing.id}), updating password...`);
    await admin.auth.admin.updateUserById(existing.id, {
      password: ADMIN_PASSWORD,
      email_confirm: true,
    });
    userId = existing.id;
  } else {
    console.log("  Creating auth user...");
    const { data, error } = await admin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: ADMIN_NAME },
    });
    if (error) {
      console.error(`  FAILED: ${error.message}`);
      process.exit(1);
    }
    userId = data.user.id;
    console.log(`  Auth user created: ${userId}`);
  }

  console.log("  Upserting profile with super_admin role...");
  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    role: "super_admin",
    organisation_id: null,
    full_name: ADMIN_NAME,
    is_platform_admin: true,
  });

  if (profileError) {
    console.error(`  Profile error: ${profileError.message}`);
    process.exit(1);
  }

  console.log("\n✅ Platform admin ready!\n");
  console.log("  Email:    ", ADMIN_EMAIL);
  console.log("  Password: ", ADMIN_PASSWORD);
  console.log("  Role:      super_admin");
  console.log("  Dashboard: /admin\n");
}

seedPlatformAdmin().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
