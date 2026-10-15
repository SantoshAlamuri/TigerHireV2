import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const hasLiveSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
  shouldEnforceAuthCsrfToken: () => false,
  startAuthCsrfIssuerProbe: () => undefined,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  RATE_LIMIT_PRESETS: { auth: { limit: 10, windowSecs: 60 } },
  checkRateLimit: () => Promise.resolve({ allowed: true, remaining: 9, resetAt: new Date() }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve(
      createClient(
        String(process.env.NEXT_PUBLIC_SUPABASE_URL),
        String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
        { auth: { autoRefreshToken: false, persistSession: false } },
      ),
    ),
}));

describe.skipIf(!hasLiveSupabaseEnv)("password login blocking behavior (live DB)", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const password = "Test123!@#";

  const oauthDomain = `pwd-oauth-${suffix}.example.com`;
  const nativeDomain = `pwd-native-${suffix}.example.com`;
  const blockedEmail = `blocked@${oauthDomain}`;
  const superEmail = `super@${oauthDomain}`;
  const nativeEmail = `native@${nativeDomain}`;

  let admin: ReturnType<typeof createSupabaseAdmin>;
  let orgOauth = "";
  let orgNative = "";
  let blockedUser = "";
  let superUser = "";
  let nativeUser = "";

  beforeAll(async () => {
    admin = createSupabaseAdmin();
    const { data: orgRows, error: orgError } = await admin
      .from("organisations")
      .insert([
        {
          type: "company",
          name: `Pwd OAuth ${suffix}`,
          slug: `pwd-oauth-${suffix}`,
          approval: "approved",
          company_plan: "starter",
        },
        {
          type: "company",
          name: `Pwd Native ${suffix}`,
          slug: `pwd-native-${suffix}`,
          approval: "approved",
          company_plan: "starter",
        },
      ])
      .select("id");
    if (orgError || !orgRows?.[0]?.id || !orgRows?.[1]?.id) {
      throw new Error(`Failed to create orgs: ${orgError?.message}`);
    }
    orgOauth = orgRows[0].id;
    orgNative = orgRows[1].id;

    const { error: mapError } = await admin.from("company_sso_mappings").insert([
      {
        company_id: orgOauth,
        provider_type: "oauth_google",
        primary_domain: oauthDomain,
        status: "active",
        domain_verified_at: new Date().toISOString(),
      },
      {
        company_id: orgNative,
        provider_type: "email_password",
        primary_domain: nativeDomain,
        status: "active",
        domain_verified_at: new Date().toISOString(),
      },
    ]);
    if (mapError) throw new Error(`Failed to create SSO mappings: ${mapError.message}`);

    const createUser = async (email: string) => {
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (!created.data.user?.id) throw new Error(`Failed to create auth user for ${email}`);
      return created.data.user.id;
    };

    blockedUser = await createUser(blockedEmail);
    superUser = await createUser(superEmail);
    nativeUser = await createUser(nativeEmail);

    const { error: profileError } = await admin.from("profiles").upsert(
      [
        {
          id: blockedUser,
          role: "leadership",
          role_status: "active",
          organisation_id: orgOauth,
          is_platform_admin: false,
          is_active: true,
          full_name: "Blocked User",
        },
        {
          id: superUser,
          role: "super_admin",
          role_status: "active",
          organisation_id: null,
          is_platform_admin: true,
          is_active: true,
          full_name: "Emergency Admin",
        },
        {
          id: nativeUser,
          role: "leadership",
          role_status: "active",
          organisation_id: orgNative,
          is_platform_admin: false,
          is_active: true,
          full_name: "Native User",
        },
      ],
      { onConflict: "id" },
    );
    if (profileError) throw new Error(`Failed to upsert profiles: ${profileError.message}`);
  });

  afterAll(async () => {
    const ids = [blockedUser, superUser, nativeUser].filter(Boolean);
    if (ids.length) {
      await admin.from("profiles").delete().in("id", ids);
      for (const id of ids) await admin.auth.admin.deleteUser(id);
    }
    const orgIds = [orgOauth, orgNative].filter(Boolean);
    if (orgIds.length) {
      await admin.from("company_sso_mappings").delete().in("company_id", orgIds);
      await admin.from("organisations").delete().in("id", orgIds);
    }
  });

  async function postLogin(email: string) {
    const { POST } = await import("@/app/api/auth/login/route");
    return POST(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ email, password }),
      }) as never,
    );
  }

  it("blocks password login for verified non-password SSO mapping", async () => {
    const response = await postLogin(blockedEmail);
    // Login deliberately uses the same response as invalid credentials so it
    // does not disclose an organisation's SSO configuration to the caller.
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe(
      "Invalid email or password. Please check your credentials and try again.",
    );
    expect(body.user).toBeUndefined();
  });

  it("allows emergency admin login and writes bypass audit", async () => {
    const response = await postLogin(superEmail);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user?.role).toBe("super_admin");

    const { data: audit } = await admin
      .from("audit_log")
      .select("event_type")
      .eq("organisation_id", orgOauth)
      .eq("actor_user_id", superUser)
      .eq("event_type", "auth.password.emergency_admin_bypass")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    expect(audit?.event_type).toBe("auth.password.emergency_admin_bypass");
  });

  it("allows password login when mapping provider_type is email_password", async () => {
    const response = await postLogin(nativeEmail);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user?.email).toBe(nativeEmail);
  });
});
