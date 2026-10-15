// @vitest-environment node
/** Live tenant filtering and RLS, using actual signed-in preview users. */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createTenantScopedClient } from "@/lib/tenancy/tenant-scoped-client";
import type { UserRole } from "@/types";

// Vitest has no Next request cookie store. Only replace the request adapter;
// database requests and authentication still use real user credentials and RLS.
let sessionClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => sessionClient,
}));

const hasLiveSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() &&
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
);

describe.skipIf(!hasLiveSupabaseEnv)("Tenant Isolation (live DB)", () => {
  const suffix = randomUUID();
  const password = "Test123!@#";
  const orgIds: string[] = [];
  const userIds: string[] = [];
  const jobIds: string[] = [];
  const users = new Map<string, { email: string; role: UserRole; organisationId: string | null }>();
  const sessions: SupabaseClient[] = [];
  let admin: ReturnType<typeof createSupabaseAdmin>;
  let orgA: string, orgB: string, agencyOrg: string;
  let userA: string, agencyUser: string, superAdminUser: string;
  let jobA: string, jobB: string;

  async function createOrg(label: string, type: "company" | "agency") {
    const { data, error } = await admin
      .from("organisations")
      .insert({
        name: `Tenant test ${label} ${suffix}`,
        slug: `tenant-${label}-${suffix}`,
        type,
        approval: "approved",
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Organisation fixture failed: ${error?.message}`);
    orgIds.push(data.id);
    return data.id as string;
  }

  async function createUser(label: string, role: UserRole, organisationId: string | null) {
    const email = `tenant-${label}-${suffix}@example.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`Auth fixture failed: ${error?.message}`);
    const id = data.user.id;
    userIds.push(id);
    const profile = await admin.from("profiles").upsert({
      id,
      role,
      organisation_id: organisationId,
      full_name: `Tenant ${label}`,
      role_status: "active",
      is_active: true,
      is_platform_admin: role === "super_admin",
    });
    if (profile.error) throw new Error(`Profile fixture failed: ${profile.error.message}`);
    users.set(id, { email, role, organisationId });
    return id;
  }

  async function createJob(title: string, organisationId: string) {
    const { data, error } = await admin
      .from("jobs")
      .insert({
        title,
        description: "Tenant test fixture",
        organisation_id: organisationId,
        status: "open",
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Job fixture failed: ${error?.message}`);
    jobIds.push(data.id);
    return data.id as string;
  }

  async function asUser(userId: string) {
    const user = users.get(userId)!;
    sessionClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    sessions.push(sessionClient);
    const { error } = await sessionClient.auth.signInWithPassword({ email: user.email, password });
    if (error) throw new Error(`User session failed: ${error.message}`);
    return createTenantScopedClient({
      userId,
      role: user.role,
      organisationId: user.organisationId,
    });
  }

  beforeAll(async () => {
    // These tests create and delete fixtures; never target another project.
    expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin).toBe(
      "https://htdyomyhkvhcwoeodwas.supabase.co",
    );
    admin = createSupabaseAdmin();
    orgA = await createOrg("a", "company");
    orgB = await createOrg("b", "company");
    agencyOrg = await createOrg("agency", "agency");
    userA = await createUser("a", "recruiter", orgA);
    agencyUser = await createUser("agency", "agency", agencyOrg);
    superAdminUser = await createUser("admin", "super_admin", null);
    jobA = await createJob("Tenant Job A", orgA);
    jobB = await createJob("Tenant Job B", orgB);
    const { error } = await admin.from("agency_clients").insert({
      agency_organisation_id: agencyOrg,
      client_organisation_id: orgA,
      status: "active",
      is_active: true,
    });
    if (error) throw new Error(`Consented agency fixture failed: ${error.message}`);
  }, 60000);

  afterAll(async () => {
    await Promise.all(sessions.map((client) => client.auth.signOut()));
    if (!admin) return;
    if (agencyOrg)
      await admin.from("agency_clients").delete().eq("agency_organisation_id", agencyOrg);
    if (jobIds.length) await admin.from("jobs").delete().in("id", jobIds);
    if (userIds.length) {
      await admin.from("profiles").delete().in("id", userIds);
      for (const id of userIds) await admin.auth.admin.deleteUser(id);
    }
    if (orgIds.length) await admin.from("organisations").delete().in("id", orgIds);
  }, 60000);

  it("allows a recruiter to read their own organisation's job", async () => {
    const db = await asUser(userA);
    const { data, error } = await db.jobs().select("id").eq("id", jobA);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: jobA }]);
  });
  it("excludes another organisation's job", async () => {
    const db = await asUser(userA);
    const { data, error } = await db.jobs().select("id").eq("id", jobB);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
  it("asserts access to the recruiter's own job", async () => {
    await expect((await asUser(userA)).assertJobAccess(jobA)).resolves.toBe(true);
  });
  it("denies access when RLS hides the other organisation's job", async () => {
    await expect((await asUser(userA)).assertJobAccess(jobB)).resolves.toBe(false);
  });
  it("allows a consented agency to read its client's job", async () => {
    const { data, error } = await (await asUser(agencyUser)).jobs().select("id").eq("id", jobA);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: jobA }]);
  });
  it("excludes a non-client's job for an agency", async () => {
    const { data, error } = await (await asUser(agencyUser)).jobs().select("id").eq("id", jobB);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
  it("asserts consented agency access", async () => {
    await expect((await asUser(agencyUser)).assertJobAccess(jobA)).resolves.toBe(true);
  });
  it("allows a platform admin to read both fixture jobs", async () => {
    const { data, error } = await (await asUser(superAdminUser))
      .jobs()
      .select("id")
      .in("id", [jobA, jobB]);
    expect(error).toBeNull();
    expect(data?.map((job) => job.id).sort()).toEqual([jobA, jobB].sort());
  });
  it("asserts platform admin access to both jobs", async () => {
    const db = await asUser(superAdminUser);
    await expect(db.assertJobAccess(jobA)).resolves.toBe(true);
    await expect(db.assertJobAccess(jobB)).resolves.toBe(true);
  });
});
