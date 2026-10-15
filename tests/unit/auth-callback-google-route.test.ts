import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSignInWithIdToken = vi.fn();
const mockCompleteOAuthSessionRedirect = vi.fn();

// Mutable cookie store shared with the next/headers mock.
let cookieValues: Record<string, string> = {};
const mockCookieGet = vi.fn((name: string) =>
  cookieValues[name] !== undefined ? { name, value: cookieValues[name] } : undefined,
);
const mockCookieDelete = vi.fn((name: string) => {
  delete cookieValues[name];
});

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: mockCookieGet,
      delete: mockCookieDelete,
      set: vi.fn(),
    }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      auth: { signInWithIdToken: mockSignInWithIdToken },
    }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/config/env", () => ({
  env: {
    baseUrl: "https://tigerhire.io",
    googleClientId: "client-id",
    googleClientSecret: "secret",
  },
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: () => Promise.resolve({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIpForRateLimit: () => "127.0.0.1",
  RATE_LIMIT_PRESETS: {
    default: { limit: 30, windowSecs: 60 },
    auth: { limit: 10, windowSecs: 60 },
  },
}));

vi.mock("@/lib/auth/oauth-session-completion", () => ({
  completeOAuthSessionRedirect: (...args: unknown[]) => mockCompleteOAuthSessionRedirect(...args),
}));

const NONCE = "a".repeat(64);

/** Encode a state payload the same way the OAuth start route does (base64url). */
function encodeState(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function callbackUrl(params: Record<string, string>): string {
  const sp = new URLSearchParams(params);
  return `http://localhost:3000/api/auth/callback/google?${sp.toString()}`;
}

describe("GET /api/auth/callback/google — OAuth nonce validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieValues = { oauth_state_nonce: NONCE };
    mockSignInWithIdToken.mockResolvedValue({
      data: { user: { id: "user-1", email: "user@acme.com" } },
      error: null,
    });
    mockCompleteOAuthSessionRedirect.mockReturnValue(
      // Mimic the helper's redirect response.
      Response.redirect("https://tigerhire.io/home", 307),
    );
    // Google token exchange succeeds.
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id_token: "id-token", access_token: "access-token" }),
        }),
      ),
    );
  });

  it("completes sign-in when the state nonce matches the cookie", async () => {
    const { GET } = await import("@/app/api/auth/callback/google/route");
    const url = callbackUrl({
      code: "good",
      state: encodeState({ redirect_to: "/", nonce: NONCE }),
    });
    await GET(new Request(url) as never);

    expect(mockSignInWithIdToken).toHaveBeenCalledTimes(1);
    expect(mockCompleteOAuthSessionRedirect).toHaveBeenCalledTimes(1);
    // Nonce cookie is cleared (single-use) after successful validation.
    expect(mockCookieDelete).toHaveBeenCalledWith("oauth_state_nonce");
  });

  it("rejects when the nonce cookie is missing (fail closed)", async () => {
    cookieValues = {}; // no cookie
    const { GET } = await import("@/app/api/auth/callback/google/route");
    const url = callbackUrl({
      code: "good",
      state: encodeState({ redirect_to: "/", nonce: NONCE }),
    });
    const res = await GET(new Request(url) as never);

    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("invalid_state");
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it("rejects when the state nonce does not match the cookie", async () => {
    const { GET } = await import("@/app/api/auth/callback/google/route");
    const url = callbackUrl({
      code: "good",
      state: encodeState({ redirect_to: "/", nonce: "b".repeat(64) }),
    });
    const res = await GET(new Request(url) as never);

    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("invalid_state");
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
    expect(mockCookieDelete).toHaveBeenCalledWith("oauth_state_nonce");
  });

  it("rejects when the state has no nonce field", async () => {
    const { GET } = await import("@/app/api/auth/callback/google/route");
    const url = callbackUrl({ code: "good", state: encodeState({ redirect_to: "/" }) });
    const res = await GET(new Request(url) as never);

    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("invalid_state");
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it("rejects malformed state before reaching nonce validation", async () => {
    const { GET } = await import("@/app/api/auth/callback/google/route");
    const url = callbackUrl({ code: "good", state: "!!!not-base64-json!!!" });
    const res = await GET(new Request(url) as never);

    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    // Unparseable state → state is null → existing missing_code guard.
    expect(location.searchParams.get("error")).toBe("missing_code");
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });
});
