import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const hasLiveSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

let oauthUser: Record<string, unknown> | null = null;
const mockSignOut = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      auth: {
        exchangeCodeForSession: () =>
          Promise.resolve({
            data: { user: oauthUser },
            error: null,
          }),
        signOut: (...args: unknown[]) => mockSignOut(...args),
      },
    }),
}));

describe.skipIf(!hasLiveSupabaseEnv)("OAuth callback behavior (live DB)", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const domainA = `phase2-a-${suffix}.example.com`;
  const domainB = `phase2-b-${suffix}.example.com`;
  const emailPending = `employee@${domainA}`;
  const emailInvited = `invited@${domainA}`;
  const emailUnverified = `unverified@${domainB}`;
  // Gmail plus-addressing keeps the public-domain semantics but makes each run's
  // fixture unique. With a fixed address, one interrupted run (beforeAll timing
  // out after createUser) left the user behind, and every later run then died at
  // "Failed to create auth user" until someone deleted it by hand. 2026-09-16.
  const emailPublic = `public.user+${suffix}@gmail.com`;
  // Invited users whose company domain is NOT SSO-verified: domainB has an SSO mapping
  // with domain_verified_at=null (=> domain_unverified), and a plain public gmail address.
  const emailInviteNoSso = `invited-nosso@${domainB}`;
  const emailInvitePublic = `invited.public+${suffix}@gmail.com`;
  // A business domain with NO company_sso_mappings row -> employer auto-create.
  const domainNew = `newco-${suffix}.example.com`;
  const emailNewEmployer = `founder@${domainNew}`;

  let orgA = "";
  let orgB = "";
  let userPending = "";
  let userInvited = "";
  let userUnverified = "";
  let userPublic = "";
  let userExistingPending = "";
  let userExistingSuspended = "";
  let userExistingActive = "";
  let userInviteNoSso = "";
  let userInvitePublic = "";
  let userNewEmployer = "";
  let inviteId = "";
  let inviteNoSsoId = "";
  let invitePublicId = "";
  let admin: ReturnType<typeof createSupabaseAdmin>;

  beforeAll(async () => {
    admin = createSupabaseAdmin();

    const { data: orgRows, error: orgError } = await admin
      .from("organisations")
      .insert([
        {
          type: "company",
          name: `Phase2 OAuth A ${suffix}`,
          slug: `phase2-oauth-a-${suffix}`,
          approval: "approved",
          company_plan: "starter",
        },
        {
          type: "company",
          name: `Phase2 OAuth B ${suffix}`,
          slug: `phase2-oauth-b-${suffix}`,
          approval: "approved",
          company_plan: "starter",
        },
      ])
      .select("id");
    if (orgError || !orgRows?.[0]?.id || !orgRows?.[1]?.id) {
      throw new Error(`Failed to create orgs: ${orgError?.message}`);
    }
    orgA = orgRows[0].id;
    orgB = orgRows[1].id;

    const { error: mapError } = await admin.from("company_sso_mappings").insert([
      {
        company_id: orgA,
        provider_type: "oauth_google",
        primary_domain: domainA,
        status: "active",
        domain_verified_at: new Date().toISOString(),
      },
      {
        company_id: orgB,
        provider_type: "oauth_google",
        primary_domain: domainB,
        status: "active",
        domain_verified_at: null,
      },
    ]);
    if (mapError) throw new Error(`Failed to create SSO mappings: ${mapError.message}`);

    const createUser = async (email: string) => {
      const created = await admin.auth.admin.createUser({
        email,
        password: "Test123!@#",
        email_confirm: true,
        user_metadata: { full_name: "Phase2 User" },
      });
      if (!created.data.user?.id) throw new Error(`Failed to create auth user for ${email}`);
      return created.data.user.id;
    };

    userPending = await createUser(emailPending);
    userInvited = await createUser(emailInvited);
    userUnverified = await createUser(emailUnverified);
    userPublic = await createUser(emailPublic);
    userExistingPending = await createUser(`existing-pending@${domainA}`);
    userExistingSuspended = await createUser(`existing-suspended@${domainA}`);
    userExistingActive = await createUser(`existing-active@${domainA}`);
    userInviteNoSso = await createUser(emailInviteNoSso);
    userInvitePublic = await createUser(emailInvitePublic);
    userNewEmployer = await createUser(emailNewEmployer);

    const { data: insertedInvites, error: inviteError } = await admin
      .from("invites")
      .insert([
        {
          email: emailInvited,
          organisation_id: orgA,
          role: "recruiter",
          token: `tok-${suffix}`,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
        {
          // Invited to orgB, whose domain is claimed but NOT verified (domain_unverified).
          email: emailInviteNoSso,
          organisation_id: orgB,
          role: "recruiter",
          token: `tok-nosso-${suffix}`,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
        {
          // Invited at a public (gmail) address, org has no SSO mapping at all.
          email: emailInvitePublic,
          organisation_id: orgA,
          role: "recruiter",
          token: `tok-public-${suffix}`,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
      ])
      .select("id, email");
    if (inviteError || insertedInvites?.length !== 3)
      throw new Error(`Failed to create invites: ${inviteError?.message}`);
    inviteId = insertedInvites.find((r) => r.email === emailInvited)?.id ?? "";
    inviteNoSsoId = insertedInvites.find((r) => r.email === emailInviteNoSso)?.id ?? "";
    invitePublicId = insertedInvites.find((r) => r.email === emailInvitePublic)?.id ?? "";
    if (!inviteId || !inviteNoSsoId || !invitePublicId)
      throw new Error("Failed to resolve inserted invite ids");

    const { error: existingProfileError } = await admin.from("profiles").upsert(
      [
        {
          id: userExistingPending,
          organisation_id: orgA,
          role: null,
          role_status: "pending",
          is_active: true,
          full_name: "Existing Pending",
        },
        {
          id: userExistingSuspended,
          organisation_id: orgA,
          role: "recruiter",
          role_status: "suspended",
          is_active: true,
          full_name: "Existing Suspended",
        },
        {
          id: userExistingActive,
          organisation_id: orgA,
          role: "recruiter",
          role_status: "active",
          is_active: true,
          full_name: "Existing Active",
        },
      ],
      { onConflict: "id" },
    );
    if (existingProfileError) {
      throw new Error(`Failed to create existing profiles: ${existingProfileError.message}`);
    }
  });

  afterAll(async () => {
    if (!admin) return;
    const allUsers = [
      userPending,
      userInvited,
      userUnverified,
      userPublic,
      userExistingPending,
      userExistingSuspended,
      userExistingActive,
      userInviteNoSso,
      userInvitePublic,
      userNewEmployer,
    ].filter(Boolean);
    if (allUsers.length) await admin.from("profiles").delete().in("id", allUsers);
    const inviteIds = [inviteId, inviteNoSsoId, invitePublicId].filter(Boolean);
    if (inviteIds.length) await admin.from("invites").delete().in("id", inviteIds);
    for (const id of allUsers) {
      await admin.auth.admin.deleteUser(id);
    }
    // The employer auto-create test spins up a fresh org + SSO mapping for domainNew.
    const { data: newMapping } = await admin
      .from("company_sso_mappings")
      .select("company_id")
      .eq("primary_domain", domainNew)
      .maybeSingle();
    const autoOrgId = newMapping?.company_id as string | undefined;
    const orgIds = [orgA, orgB, autoOrgId].filter(Boolean) as string[];
    if (orgIds.length) {
      await admin.from("company_sso_mappings").delete().in("company_id", orgIds);
      await admin.from("organisations").delete().in("id", orgIds);
    }
  });

  async function runCallbackFor(userId: string, email: string) {
    oauthUser = {
      id: userId,
      email,
      email_confirmed_at: new Date().toISOString(),
      user_metadata: { full_name: "Phase2 User" },
      app_metadata: { provider: "google" },
    };
    const { GET } = await import("@/app/api/auth/callback/route");
    return GET(new Request("http://localhost:3000/api/auth/callback?code=live") as never);
  }

  it("uninvited user whose company exists => ask their admin, no profile", async () => {
    const res = await runCallbackFor(userPending, emailPending);
    const location = new URL(res.headers.get("location") ?? "http://localhost");
    expect(location.pathname).toBe("/auth/no-access");
    expect(location.searchParams.get("reason")).toBe("ask_admin");
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userPending)
      .maybeSingle();
    expect(profile).toBeNull();
  });

  it("invited user (verified domain) => active invited role", async () => {
    const res = await runCallbackFor(userInvited, emailInvited);
    const location = new URL(res.headers.get("location") ?? "http://localhost");
    expect(location.pathname).not.toBe("/auth/no-access");
    const { data: profile } = await admin
      .from("profiles")
      .select("organisation_id, role, role_status")
      .eq("id", userInvited)
      .maybeSingle();
    expect(profile?.organisation_id).toBe(orgA);
    expect(profile?.role).toBe("recruiter");
    expect(profile?.role_status).toBe("active");
    const { data: invite } = await admin
      .from("invites")
      .select("accepted_at")
      .eq("id", inviteId)
      .maybeSingle();
    expect(Boolean(invite?.accepted_at)).toBe(true);
  });

  it("uninvited user on an unverified (but claimed) domain => ask their admin", async () => {
    const res = await runCallbackFor(userUnverified, emailUnverified);
    const location = new URL(res.headers.get("location") ?? "http://localhost");
    expect(location.pathname).toBe("/auth/no-access");
    expect(location.searchParams.get("reason")).toBe("ask_admin");
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userUnverified)
      .maybeSingle();
    expect(profile).toBeNull();
  });

  it("invited user on an unverified/non-SSO domain => active invited role (no loop)", async () => {
    const res = await runCallbackFor(userInviteNoSso, emailInviteNoSso);
    const location = new URL(res.headers.get("location") ?? "http://localhost");
    expect(location.pathname).not.toBe("/auth/no-access");
    expect(location.pathname).not.toBe("/login");
    const { data: profile } = await admin
      .from("profiles")
      .select("organisation_id, role, role_status, is_active")
      .eq("id", userInviteNoSso)
      .maybeSingle();
    expect(profile?.organisation_id).toBe(orgB);
    expect(profile?.role).toBe("recruiter");
    expect(profile?.role_status).toBe("active");
    expect(profile?.is_active).toBe(true);
    const { data: invite } = await admin
      .from("invites")
      .select("accepted_at")
      .eq("id", inviteNoSsoId)
      .maybeSingle();
    expect(Boolean(invite?.accepted_at)).toBe(true);
  });

  it("invited user at a public-domain address => active invited role", async () => {
    const res = await runCallbackFor(userInvitePublic, emailInvitePublic);
    const location = new URL(res.headers.get("location") ?? "http://localhost");
    expect(location.pathname).not.toBe("/auth/no-access");
    const { data: profile } = await admin
      .from("profiles")
      .select("organisation_id, role, role_status")
      .eq("id", userInvitePublic)
      .maybeSingle();
    expect(profile?.organisation_id).toBe(orgA);
    expect(profile?.role).toBe("recruiter");
    expect(profile?.role_status).toBe("active");
    const { data: invite } = await admin
      .from("invites")
      .select("accepted_at")
      .eq("id", invitePublicId)
      .maybeSingle();
    expect(Boolean(invite?.accepted_at)).toBe(true);
  });

  it("company-mode sign-in with a personal email => work_email_required", async () => {
    const res = await runCallbackFor(userPublic, emailPublic);
    const location = new URL(res.headers.get("location") ?? "http://localhost");
    expect(location.pathname).toBe("/auth/no-access");
    expect(location.searchParams.get("reason")).toBe("work_email_required");
  });

  it("employer on an unclaimed business domain => auto-creates their company", async () => {
    const res = await runCallbackFor(userNewEmployer, emailNewEmployer);
    const location = new URL(res.headers.get("location") ?? "http://localhost");
    expect(location.pathname).not.toBe("/auth/no-access");
    const { data: profile } = await admin
      .from("profiles")
      .select("organisation_id, role, role_status, is_active, is_org_admin")
      .eq("id", userNewEmployer)
      .maybeSingle();
    expect(profile?.role).toBe("leadership");
    expect(profile?.role_status).toBe("active");
    expect(profile?.is_active).toBe(true);
    expect(profile?.is_org_admin).toBe(true);
    // A company + domain claim were created.
    const { data: org } = await admin
      .from("organisations")
      .select("type, approval")
      .eq("id", profile?.organisation_id)
      .maybeSingle();
    expect(org?.type).toBe("company");
    expect(org?.approval).toBe("approved");
    const { data: mapping } = await admin
      .from("company_sso_mappings")
      .select("company_id")
      .eq("primary_domain", domainNew)
      .maybeSingle();
    expect(mapping?.company_id).toBe(profile?.organisation_id);
  });

  it("existing suspended user => no-access", async () => {
    const res = await runCallbackFor(userExistingSuspended, `existing-suspended@${domainA}`);
    const location = new URL(res.headers.get("location") ?? "http://localhost");
    expect(location.pathname).toBe("/auth/no-access");
    expect(location.searchParams.get("reason")).toBe("account_suspended");
  });

  it("existing active user => dashboard", async () => {
    const res = await runCallbackFor(userExistingActive, `existing-active@${domainA}`);
    const location = new URL(res.headers.get("location") ?? "http://localhost");
    expect(location.pathname).not.toBe("/auth/no-access");
    expect(location.pathname).not.toBe("/login");
  });

  it("writes an ask_admin audit event for an uninvited company match", async () => {
    const { data: audits } = await admin
      .from("audit_log")
      .select("event_type")
      .eq("organisation_id", orgA)
      .eq("actor_user_id", userPending)
      .in("event_type", ["auth.oauth.ask_admin"]);
    expect((audits ?? []).length).toBeGreaterThanOrEqual(1);
  });
});
