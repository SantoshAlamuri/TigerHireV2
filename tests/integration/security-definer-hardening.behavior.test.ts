import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const hasLiveSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const GLOBAL_HARDENING_MIGRATION =
  "supabase/migrations/20260418213000_security_definer_global_hardening.sql";
const SEARCH_PATH_HARDENING_MIGRATION =
  "supabase/migrations/20260418223000_harden_function_search_path_and_agent_email_policy.sql";

describe("SECURITY DEFINER hardening migration contract", () => {
  it("enforces global public-schema SECURITY DEFINER search_path + execute-grant policy", () => {
    const sql = readFileSync(
      resolve(process.cwd(), GLOBAL_HARDENING_MIGRATION),
      "utf8",
    ).toLowerCase();

    expect(sql).toContain("where n.nspname = 'public'");
    expect(sql).toContain("and p.prosecdef = true");
    expect(sql).toContain("set search_path = pg_catalog, public");
    expect(sql).toContain("revoke execute on");
    expect(sql).toContain("from public, anon");
    expect(sql).toContain("grant execute on");
    expect(sql).toContain("to authenticated, service_role, postgres");
  });

  it("pins known mutable routines to hardened search_path values", () => {
    const sql = readFileSync(
      resolve(process.cwd(), SEARCH_PATH_HARDENING_MIGRATION),
      "utf8",
    ).toLowerCase();

    expect(sql).toContain("alter function public.prevent_public_domain_claim()");
    expect(sql).toContain("alter function public.set_updated_at()");
    expect(sql).toContain("set search_path = pg_catalog, public;");
    expect(sql).toContain("set search_path = pg_catalog, public, extensions;");
  });
});

describe.skipIf(!hasLiveSupabaseEnv)("SECURITY DEFINER execute grants behavior (live DB)", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const password = "Test123!@#";
  const userEmail = `secdef-${suffix}@example.test`;
  const orgSlug = `secdef-org-${suffix}`;

  let admin: ReturnType<typeof createSupabaseAdmin>;
  let anonClient: SupabaseClient;
  let authenticatedClient: SupabaseClient;
  let userId = "";
  let orgId = "";

  beforeAll(async () => {
    admin = createSupabaseAdmin();
    anonClient = createClient(
      String(process.env.NEXT_PUBLIC_SUPABASE_URL),
      String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    authenticatedClient = createClient(
      String(process.env.NEXT_PUBLIC_SUPABASE_URL),
      String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: insertedOrg, error: orgError } = await admin
      .from("organisations")
      .insert({
        type: "company",
        name: `SECDEF Org ${suffix}`,
        slug: orgSlug,
        approval: "approved",
        company_plan: "starter",
      })
      .select("id")
      .single();
    if (orgError || !insertedOrg?.id)
      throw new Error("Failed to create organisation for SECURITY DEFINER test");
    orgId = insertedOrg.id;

    const created = await admin.auth.admin.createUser({
      email: userEmail,
      password,
      email_confirm: true,
    });
    if (!created.data.user?.id)
      throw new Error("Failed to create auth user for SECURITY DEFINER test");
    userId = created.data.user.id;

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: userId,
        role: "leadership",
        role_status: "active",
        organisation_id: orgId,
        is_platform_admin: false,
        is_active: true,
        full_name: "SECDEF Tester",
      },
      { onConflict: "id" },
    );
    if (profileError) throw new Error(`Failed to upsert profile: ${profileError.message}`);

    const signIn = await authenticatedClient.auth.signInWithPassword({
      email: userEmail,
      password,
    });
    if (signIn.error) throw new Error("Failed to sign in test user for SECURITY DEFINER test");
  });

  afterAll(async () => {
    await authenticatedClient.auth.signOut();
    if (userId) {
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
    if (orgId) await admin.from("organisations").delete().eq("id", orgId);
  });

  it("anonymous callers cannot execute representative SECURITY DEFINER routines", async () => {
    const randomId = randomUUID();
    const anonCalls = [
      () => anonClient.rpc("auth_organisation_ids"),
      () => anonClient.rpc("auth_can_see_organisation", { p_org_id: randomId }),
      () =>
        anonClient.rpc("can_org_access_candidate", {
          p_candidate_id: randomId,
          p_organisation_id: randomId,
        }),
      () => anonClient.rpc("can_caller_orgs_access_candidate", { p_candidate_id: randomId }),
      () =>
        anonClient.rpc("can_caller_orgs_access_candidate_resume", {
          p_path_first_segment: randomId,
        }),
      () => anonClient.rpc("get_accessible_candidate_ids", { p_organisation_ids: [randomId] }),
    ];

    for (const call of anonCalls) {
      const { error } = await call();
      expect(error).not.toBeNull();
      expect(String(error?.message ?? "").toLowerCase()).not.toContain("does not exist");
    }
  });

  it("authenticated callers can execute the same representative SECURITY DEFINER routines", async () => {
    const randomId = randomUUID();

    const orgIdsRes = await authenticatedClient.rpc("auth_organisation_ids");
    expect(orgIdsRes.error).toBeNull();
    expect(orgIdsRes.data ?? []).toContain(orgId);

    const canSeeOrgRes = await authenticatedClient.rpc("auth_can_see_organisation", {
      p_org_id: orgId,
    });
    expect(canSeeOrgRes.error).toBeNull();
    expect(canSeeOrgRes.data).toBe(true);

    const canAccessCandidateRes = await authenticatedClient.rpc("can_org_access_candidate", {
      p_candidate_id: randomId,
      p_organisation_id: orgId,
    });
    expect(canAccessCandidateRes.error).toBeNull();
    expect(canAccessCandidateRes.data).toBe(false);

    const callerAccessRes = await authenticatedClient.rpc("can_caller_orgs_access_candidate", {
      p_candidate_id: randomId,
    });
    expect(callerAccessRes.error).toBeNull();
    expect(callerAccessRes.data).toBe(false);

    const resumeAccessRes = await authenticatedClient.rpc(
      "can_caller_orgs_access_candidate_resume",
      {
        p_path_first_segment: randomId,
      },
    );
    expect(resumeAccessRes.error).toBeNull();
    expect(resumeAccessRes.data).toBe(false);

    // The later 20260621130100 migration deliberately made this caller-supplied
    // org-ID enumeration RPC service-role-only. Restoring authenticated EXECUTE
    // to satisfy the older test would reopen cross-tenant candidate enumeration.
    const candidateIdsRes = await authenticatedClient.rpc("get_accessible_candidate_ids", {
      p_organisation_ids: [orgId],
    });
    expect(candidateIdsRes.error?.code).toBe("42501");
    const serviceCandidateIds = await admin.rpc("get_accessible_candidate_ids", {
      p_organisation_ids: [orgId],
    });
    expect(serviceCandidateIds.error).toBeNull();
    expect(Array.isArray(serviceCandidateIds.data)).toBe(true);
  });
});
