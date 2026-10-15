import { describe, expect, it } from "vitest";
import { parseRecoveryHash } from "@/lib/auth/recovery-hash";

describe("parseRecoveryHash", () => {
  it("extracts tokens from an implicit-flow recovery fragment", () => {
    const parsed = parseRecoveryHash(
      "#access_token=at.123&expires_in=3600&refresh_token=rt.456&token_type=bearer&type=recovery",
    );
    expect(parsed).toEqual({
      kind: "tokens",
      accessToken: "at.123",
      refreshToken: "rt.456",
      type: "recovery",
    });
  });

  it("accepts a fragment without the leading #", () => {
    const parsed = parseRecoveryHash("access_token=a&refresh_token=b");
    expect(parsed.kind).toBe("tokens");
  });

  it("reports Supabase link errors carried in the fragment", () => {
    const parsed = parseRecoveryHash(
      "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );
    expect(parsed).toEqual({
      kind: "error",
      code: "otp_expired",
      description: "Email link is invalid or has expired",
    });
  });

  it("returns none for an empty or unrelated fragment", () => {
    expect(parseRecoveryHash("")).toEqual({ kind: "none" });
    expect(parseRecoveryHash("#")).toEqual({ kind: "none" });
    expect(parseRecoveryHash("#section-2")).toEqual({ kind: "none" });
  });

  it("does not treat a lone access_token as a usable session", () => {
    expect(parseRecoveryHash("#access_token=only")).toEqual({ kind: "none" });
  });
});
