import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const hasLiveSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

describe.skipIf(!hasLiveSupabaseEnv)("company_sso_mappings RLS behavior (live DB)", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const password = "Test123!@#";

  const userAEmail = `sso-admin-a-${suffix}@example.test`;
  const userBEmail = `sso-admin-b-${suffix}@example.test`;
  const platformEmail = `sso-platform-${suffix}@example.test`;

  const domainA = `acme-${suffix}.example.com`;
  const domainB = `globex-${suffix}.example.com`;

  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

  let orgA = "";
  let orgB = "";
  let userA = "";
  let userB = "";
  let platformUser = "";

  let admin: ReturnType<typeof createSupabaseAdmin>;
  let userClientA: SupabaseClient;
  let userClientPlatform: SupabaseClient;

  beforeAll(async () => {
    admin = createSupabaseAdmin();
    userClientA = createClient(
      String(process.env.NEXT_PUBLIC_SUPABASE_URL),
      String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    userClientPlatform = createClient(
      String(process.env.NEXT_PUBLIC_SUPABASE_URL),
      String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: insertedOrgs, error: orgError } = await admin
      .from("organisations")
      .insert([
        {
          type: "company",
          name: `RLS Co A ${suffix}`,
          slug: `rls-co-a-${suffix}`,
          approval: "approved",
          company_plan: "starter",
        },
        {
          type: "company",
          name: `RLS Co B ${suffix}`,
          slug: `rls-co-b-${suffix}`,
          approval: "approved",
          company_plan: "starter",
        },
      ])
      .select("id");
    if (orgError || !insertedOrgs?.[0]?.id || !insertedOrgs?.[1]?.id) {
      throw new Error("Failed to create organisations for RLS test");
    }
    orgA = insertedOrgs[0].id;
    orgB = insertedOrgs[1].id;
    createdOrgIds.push(orgA, orgB);

    const createA = await admin.auth.admin.createUser({
      email: userAEmail,
      password,
      email_confirm: true,
    });
    const createB = await admin.auth.admin.createUser({
      email: userBEmail,
      password,
      email_confirm: true,
    });
    const createPlatform = await admin.auth.admin.createUser({
      email: platformEmail,
      password,
      email_confirm: true,
    });
    if (!createA.data.user?.id || !createB.data.user?.id || !createPlatform.data.user?.id) {
      throw new Error("Failed to create auth users for RLS test");
    }
    userA = createA.data.user.id;
    userB = createB.data.user.id;
    platformUser = createPlatform.data.user.id;
    createdUserIds.push(userA, userB, platformUser);

    const { error: profileError } = await admin.from("profiles").upsert(
      [
        {
          id: userA,
          role: "leadership",
          role_status: "active",
          organisation_id: orgA,
          is_platform_admin: false,
          is_active: true,
          full_name: "RLS User A",
        },
        {
          id: userB,
          role: "leadership",
          role_status: "active",
          organisation_id: orgB,
          is_platform_admin: false,
          is_active: true,
          full_name: "RLS User B",
        },
        {
          id: platformUser,
          role: "super_admin",
          role_status: "active",
          organisation_id: null,
          is_platform_admin: true,
          is_active: true,
          full_name: "RLS Platform Admin",
        },
      ],
      { onConflict: "id" },
    );
    if (profileError)
      throw new Error(`Failed to upsert profiles for RLS test: ${profileError.message}`);

    const { error: mappingError } = await admin.from("company_sso_mappings").insert([
      {
        company_id: orgA,
        provider_type: "email_password",
        primary_domain: domainA,
        status: "active",
      },
      {
        company_id: orgB,
        provider_type: "email_password",
        primary_domain: domainB,
        status: "active",
      },
    ]);
    if (mappingError) throw new Error("Failed to insert mappings for RLS test");

    const signInA = await userClientA.auth.signInWithPassword({ email: userAEmail, password });
    if (signInA.error) throw new Error("Failed to sign in as org A admin");

    const signInPlatform = await userClientPlatform.auth.signInWithPassword({
      email: platformEmail,
      password,
    });
    if (signInPlatform.error) throw new Error("Failed to sign in as platform admin");
  });

  afterAll(async () => {
    await userClientA.auth.signOut();
    await userClientPlatform.auth.signOut();
    if (createdOrgIds.length) {
      await admin.from("company_sso_mappings").delete().in("company_id", createdOrgIds);
      await admin.from("profiles").delete().in("id", createdUserIds);
      for (const id of createdUserIds) {
        await admin.auth.admin.deleteUser(id);
      }
      await admin.from("organisations").delete().in("id", createdOrgIds);
    }
  });

  it("company admin of org A cannot read org B mapping", async () => {
    const { data, error } = await userClientA
      .from("company_sso_mappings")
      .select("id, company_id, primary_domain")
      .eq("company_id", orgB);

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("platform admin can read both organisations mappings", async () => {
    const { data, error } = await userClientPlatform
      .from("company_sso_mappings")
      .select("id, company_id, primary_domain")
      .in("company_id", [orgA, orgB]);

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("regular company admin cannot insert mapping row", async () => {
    const { error } = await userClientA.from("company_sso_mappings").insert({
      company_id: orgA,
      provider_type: "email_password",
      primary_domain: `blocked-insert-${suffix}.example.com`,
      status: "active",
    });
    expect(error).not.toBeNull();
  });
});
