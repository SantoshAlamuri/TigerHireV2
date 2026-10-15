import { beforeEach, describe, expect, it, vi } from "vitest";
// Landing paths moved off /home for the hiring seats; assert the constant so
// these cannot go stale the next time a seat is re-homed.
import { ROLE_DASHBOARD_PATH } from "@/types/database";

const mockExchangeCode = vi.fn();
const mockSignOut = vi.fn();
const mockRpc = vi.fn();
const mockListUsers = vi.fn();
const mockShouldSendEmail = vi.fn(() => false);
const mockSendEmail = vi.fn();
const mockCreateNotificationBatch = vi.fn();
const mockResolveOauthCompanyFromEmail = vi.fn();
const mockShouldEnforceCompanySsoForProfile = vi.fn(() => Promise.resolve(false));
const mockClaimUnclaimedCandidateByEmail = vi.fn();

const mockAdminFrom = vi.fn((table: string) => {
  if (table === "audit_log") {
    return { insert: vi.fn().mockResolvedValue({ error: null }) };
  }
  if (table === "profiles") {
    // notifyCompanyAdminsPendingAccess chains .eq four times then awaits the query.
    let eqCalls = 0;
    const chain = {
      eq: vi.fn(() => {
        eqCalls += 1;
        if (eqCalls >= 4) {
          return Promise.resolve({ data: [{ id: "admin-1" }], error: null });
        }
        return chain;
      }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    return {
      select: vi.fn(() => chain),
      insert: vi.fn().mockResolvedValue({ error: null }),
    };
  }
  return { insert: vi.fn().mockResolvedValue({ error: null }) };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      auth: {
        exchangeCodeForSession: mockExchangeCode,
        signOut: mockSignOut,
      },
    }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: mockAdminFrom,
    rpc: mockRpc,
    auth: { admin: { listUsers: mockListUsers } },
  }),
}));

vi.mock("@/lib/sso/domain", () => ({
  extractDomain: (email: string) => (email.split("@")[1] ?? "").toLowerCase(),
  resolveOauthCompanyFromEmail: (...args: unknown[]) => mockResolveOauthCompanyFromEmail(...args),
}));

vi.mock("@/lib/security/company-sso-enforcement", () => ({
  isPasswordAuthProvider: (provider: string | null) => provider === "email",
  shouldEnforceCompanySsoForProfile: (...args: unknown[]) =>
    mockShouldEnforceCompanySsoForProfile(...args),
}));

vi.mock("@/lib/agents/candidate-dedup", () => ({
  claimUnclaimedCandidateByEmail: (...args: unknown[]) =>
    mockClaimUnclaimedCandidateByEmail(...args),
}));

vi.mock("@/lib/services/notifications", () => ({
  createNotificationBatch: (...args: unknown[]) => mockCreateNotificationBatch(...args),
}));

vi.mock("@/lib/services/resend", () => ({
  shouldSendEmail: () => mockShouldSendEmail(),
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/config/env", () => ({
  env: { baseUrl: "https://tigerhire.io" },
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: () => Promise.resolve({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIpForRateLimit: () => "127.0.0.1",
  RATE_LIMIT_PRESETS: {
    default: { limit: 30, windowSecs: 60 },
    auth: { limit: 10, windowSecs: 60 },
  },
}));

// Real OAuth users arrive email-confirmed by the provider; individual tests override.
function makeUser(overrides?: Record<string, unknown>) {
  return {
    id: "user-1",
    email: "employee@acme.com",
    email_confirmed_at: "2026-07-17T10:00:00Z",
    user_metadata: { full_name: "Acme User" },
    app_metadata: { provider: "google" },
    ...overrides,
  };
}

const rpcResult = (row: Record<string, unknown>) => ({ data: [row], error: null });
const NO_INVITE = rpcResult({
  action: "no_invite",
  role: null,
  role_status: null,
  organisation_id: null,
});

async function runCallback(url = "http://localhost:3000/api/auth/callback?code=good") {
  const { GET } = await import("@/app/api/auth/callback/route");
  return GET(new Request(url) as never);
}

describe("GET /api/auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOut.mockResolvedValue({ error: null });
    mockExchangeCode.mockResolvedValue({ data: { user: makeUser() }, error: null });
    mockListUsers.mockResolvedValue({ data: { users: [] } });
    mockCreateNotificationBatch.mockResolvedValue(undefined);
    mockSendEmail.mockResolvedValue({ skipped: true });
    mockShouldEnforceCompanySsoForProfile.mockResolvedValue(false);
    mockClaimUnclaimedCandidateByEmail.mockResolvedValue(undefined);
    // Default: a returning user whose domain maps to a company; the invite RPC reports
    // an existing active profile, so they route straight to their dashboard.
    mockResolveOauthCompanyFromEmail.mockResolvedValue({
      reason: "domain_verified",
      domain: "acme.com",
      companyId: "org-1",
      providerType: "google",
    });
    mockRpc.mockResolvedValue(
      rpcResult({
        action: "existing",
        role: "recruiter",
        role_status: "active",
        organisation_id: "org-1",
      }),
    );
  });

  it("redirects to /login?error=missing_code when no code is provided", async () => {
    const res = await runCallback("http://localhost:3000/api/auth/callback");
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("missing_code");
  });

  it("hands a code-less password-reset callback to /reset-password (implicit-flow hash)", async () => {
    // The reset link carries the session in the URL fragment, which the server
    // never sees. The browser keeps the fragment across this redirect and the
    // reset page adopts it. Sending the user to /login here lost every reset.
    const res = await runCallback("http://localhost:3000/api/auth/callback?next=/reset-password");
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/reset-password");
    expect(location.searchParams.get("error")).toBeNull();
    expect(mockExchangeCode).not.toHaveBeenCalled();
  });

  it("redirects to /reset-password when password reset callback succeeds", async () => {
    const res = await runCallback(
      "http://localhost:3000/api/auth/callback?code=good&next=/reset-password",
    );
    expect(new URL(res.headers.get("location")!).pathname).toBe("/reset-password");
  });

  it("redirects to /auth/no-access when provider does not return email", async () => {
    mockExchangeCode.mockResolvedValue({
      data: { user: makeUser({ email: null, user_metadata: {} }) },
      error: null,
    });
    const res = await runCallback();
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/auth/no-access");
    expect(location.searchParams.get("reason")).toBe("email_missing");
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("routes a returning active user to their role dashboard", async () => {
    const res = await runCallback();
    expect(new URL(res.headers.get("location")!).pathname).toBe(ROLE_DASHBOARD_PATH.recruiter);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("routes a suspended returning user to no-access", async () => {
    mockRpc.mockResolvedValue(
      rpcResult({
        action: "existing",
        role: "recruiter",
        role_status: "suspended",
        organisation_id: "org-1",
      }),
    );
    const res = await runCallback();
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/auth/no-access");
    expect(location.searchParams.get("reason")).toBe("account_suspended");
  });

  it("provisions an invited user with their invited role", async () => {
    mockRpc.mockResolvedValue(
      rpcResult({
        action: "invite_linked",
        role: "recruiter",
        role_status: "active",
        organisation_id: "org-1",
      }),
    );
    const res = await runCallback();
    expect(new URL(res.headers.get("location")!).pathname).toBe(ROLE_DASHBOARD_PATH.recruiter);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("tells a personal-email employer to use their work email", async () => {
    mockResolveOauthCompanyFromEmail.mockResolvedValue({
      reason: "public_domain_blocked",
      domain: "gmail.com",
      companyId: null,
      providerType: null,
    });
    mockRpc.mockResolvedValue(NO_INVITE);
    const res = await runCallback();
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/auth/no-access");
    expect(location.searchParams.get("reason")).toBe("work_email_required");
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("tells an uninvited user whose company already exists to ask their admin", async () => {
    // domain maps to an existing company, but there is no invite and no profile yet
    mockRpc.mockResolvedValue(NO_INVITE);
    const res = await runCallback();
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/auth/no-access");
    expect(location.searchParams.get("reason")).toBe("ask_admin");
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockCreateNotificationBatch).toHaveBeenCalled(); // admins nudged
  });

  it("auto-creates a company for an employer on an unclaimed business domain", async () => {
    mockResolveOauthCompanyFromEmail.mockResolvedValue({
      reason: "domain_not_claimed",
      domain: "laundryheap.com",
      companyId: null,
      providerType: null,
    });
    mockRpc
      .mockResolvedValueOnce(NO_INVITE) // invite lookup
      .mockResolvedValueOnce(
        rpcResult({ action: "created", role: "leadership", organisation_id: "new-org" }),
      ); // employer org create
    const res = await runCallback();
    expect(new URL(res.headers.get("location")!).pathname).toBe(ROLE_DASHBOARD_PATH.leadership);
    expect(mockRpc).toHaveBeenCalledWith(
      "oauth_create_employer_org_from_domain",
      expect.objectContaining({ p_domain: "laundryheap.com", p_org_name: "Laundryheap" }),
    );
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("does not auto-create a company off an unverified email", async () => {
    mockExchangeCode.mockResolvedValue({
      data: { user: makeUser({ email_confirmed_at: null }) },
      error: null,
    });
    mockResolveOauthCompanyFromEmail.mockResolvedValue({
      reason: "domain_not_claimed",
      domain: "laundryheap.com",
      companyId: null,
      providerType: null,
    });
    const res = await runCallback();
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/auth/no-access");
    expect(location.searchParams.get("reason")).toBe("provisioning_failed");
    expect(mockRpc).not.toHaveBeenCalledWith(
      "oauth_create_employer_org_from_domain",
      expect.anything(),
    );
  });

  it("falls back to ask-admin when the domain is claimed mid-signup (race)", async () => {
    mockResolveOauthCompanyFromEmail.mockResolvedValue({
      reason: "domain_not_claimed",
      domain: "laundryheap.com",
      companyId: null,
      providerType: null,
    });
    mockRpc
      .mockResolvedValueOnce(NO_INVITE)
      .mockResolvedValueOnce(rpcResult({ action: "exists", role: null, organisation_id: "org-2" }));
    const res = await runCallback();
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/auth/no-access");
    expect(location.searchParams.get("reason")).toBe("ask_admin");
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("routes a candidate (public flow) to the candidate dashboard", async () => {
    const res = await runCallback("http://localhost:3000/api/auth/callback?code=good&flow=public");
    expect(new URL(res.headers.get("location")!).pathname).toBe("/candidate");
    expect(mockClaimUnclaimedCandidateByEmail).toHaveBeenCalled();
    // public flow never consults company domain resolution
    expect(mockResolveOauthCompanyFromEmail).not.toHaveBeenCalled();
  });
});
