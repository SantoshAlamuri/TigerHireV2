import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_USERS = [
  {
    email: "admin@tigerhire.io",
    password: "Demo@1234",
    fullName: "Santosh Kumar",
    role: "super_admin",
    orgId: null,
  },
  {
    email: "hiring@razorpay.com",
    password: "Demo@1234",
    fullName: "Priya Sharma",
    role: "leadership",
    orgId: "a1000000-0000-0000-0000-000000000001",
  },
  {
    email: "recruiter@razorpay.com",
    password: "Demo@1234",
    fullName: "Ankit Patel",
    role: "recruiter",
    orgId: "a1000000-0000-0000-0000-000000000001",
  },
  {
    email: "ops@talentbridge.in",
    password: "Demo@1234",
    fullName: "Meera Joshi",
    role: "agency",
    orgId: "a1000000-0000-0000-0000-000000000003",
  },
  {
    email: "rahul.dev@gmail.com",
    password: "Demo@1234",
    fullName: "Rahul Verma",
    role: "candidate_pro",
    orgId: null,
  },
  {
    email: "sneha.engineer@gmail.com",
    password: "Demo@1234",
    fullName: "Sneha Reddy",
    role: "candidate_free",
    orgId: null,
  },
];

async function seedUsers() {
  for (const u of DEMO_USERS) {
    console.log(`Creating ${u.email} (${u.role})...`);

    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.fullName },
    });

    if (error) {
      if (error.message.includes("already been registered")) {
        console.log(`  -> already exists, fetching...`);
        const { data: list } = await admin.auth.admin.listUsers();
        const existing = list?.users?.find((x) => x.email === u.email);
        if (existing) {
          await createProfile(existing.id, u);
        }
        continue;
      }
      console.error(`  -> ERROR: ${error.message}`);
      continue;
    }

    console.log(`  -> created: ${data.user.id}`);
    await createProfile(data.user.id, u);
  }

  console.log("\nLinking candidate profiles to candidate users...");
  await linkCandidates();
  console.log("Done!");
}

async function createProfile(userId, u) {
  const { error } = await admin.from("profiles").upsert({
    id: userId,
    role: u.role,
    organisation_id: u.orgId,
    full_name: u.fullName,
  });

  if (error) {
    console.error(`  -> profile error: ${error.message}`);
  } else {
    console.log(`  -> profile OK`);
  }
}

async function linkCandidates() {
  const { data: list } = await admin.auth.admin.listUsers();
  const users = list?.users || [];

  const rahul = users.find((u) => u.email === "rahul.dev@gmail.com");
  const sneha = users.find((u) => u.email === "sneha.engineer@gmail.com");

  if (rahul) {
    await admin
      .from("candidates")
      .update({ user_id: rahul.id })
      .eq("id", "c1000000-0000-0000-0000-000000000001");
    console.log(`  -> linked Rahul: ${rahul.id}`);
  }

  if (sneha) {
    await admin
      .from("candidates")
      .update({ user_id: sneha.id })
      .eq("id", "c1000000-0000-0000-0000-000000000002");
    console.log(`  -> linked Sneha: ${sneha.id}`);
  }
}

seedUsers().catch(console.error);
