import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const hasLiveSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const TABLES_UNDER_TEST = [
  "approval_tokens",
  "billing_plans",
  "blocked_public_domains",
  "idempotency_keys",
  "job_referral_config",
  "payout_ledger",
  "referral_links",
  "referrer_otp",
  "referrers",
  "whatsapp_message_log",
] as const;

describe.skipIf(!hasLiveSupabaseEnv)("explicit deny RLS policies behavior (live DB)", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const password = "Test123!@#";
  const userEmail = `rls-deny-${suffix}@example.test`;
  const orgSlug = `rls-deny-org-${suffix}`;

  let admin: ReturnType<typeof createSupabaseAdmin>;
  let userClient: SupabaseClient;
  let userId = "";
  let orgId = "";

  beforeAll(async () => {
    admin = createSupabaseAdmin();
    userClient = createClient(
      String(process.env.NEXT_PUBLIC_SUPABASE_URL),
      String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: insertedOrg, error: orgError } = await admin
      .from("organisations")
      .insert({
        type: "company",
        name: `RLS Deny Org ${suffix}`,
        slug: orgSlug,
        approval: "approved",
        company_plan: "starter",
      })
      .select("id")
      .single();
    if (orgError || !insertedOrg?.id) {
      throw new Error("Failed to create organisation for explicit deny RLS behavior test");
    }
    orgId = insertedOrg.id;

    const created = await admin.auth.admin.createUser({
      email: userEmail,
      password,
      email_confirm: true,
    });
    if (!created.data.user?.id)
      throw new Error("Failed to create auth user for explicit deny RLS behavior test");
    userId = created.data.user.id;

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: userId,
        role: "leadership",
        role_status: "active",
        organisation_id: orgId,
        is_platform_admin: false,
        is_active: true,
        full_name: "RLS Deny Tester",
      },
      { onConflict: "id" },
    );
    if (profileError) throw new Error(`Failed to upsert profile: ${profileError.message}`);

    const signIn = await userClient.auth.signInWithPassword({ email: userEmail, password });
    if (signIn.error)
      throw new Error("Failed to sign in test user for explicit deny RLS behavior test");
  });

  afterAll(async () => {
    await userClient.auth.signOut();
    if (userId) {
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
    if (orgId) {
      await admin.from("organisations").delete().eq("id", orgId);
    }
  });

  it("authenticated users cannot read from explicitly denied tables", async () => {
    for (const table of TABLES_UNDER_TEST) {
      const { data, error } = await userClient.from(table).select("*").limit(1);
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("authenticated users cannot mutate representative explicitly denied tables", async () => {
    const representativeTables = ["approval_tokens", "idempotency_keys", "referrer_otp"] as const;

    for (const table of representativeTables) {
      const { error } = await userClient.from(table).insert({});
      expect(error).not.toBeNull();
    }
  });
});
