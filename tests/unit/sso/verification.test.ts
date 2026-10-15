import { describe, expect, it, vi } from "vitest";

const mockResolveTxt = vi.fn();
const mockSetServers = vi.fn();
const mockResolverCtor = vi.fn();

class MockResolver {
  constructor() {
    mockResolverCtor();
  }

  setServers(...args: unknown[]) {
    return mockSetServers(...args);
  }

  resolveTxt(...args: unknown[]) {
    return mockResolveTxt(...args);
  }
}

vi.mock("node:dns/promises", () => ({
  Resolver: MockResolver,
  default: {
    Resolver: MockResolver,
  },
}));

describe("sso/verification helper", () => {
  it("generates unique token with expected prefix and length", async () => {
    const { generateVerificationToken } = await import("@/lib/sso/verification");
    const a = generateVerificationToken();
    const b = generateVerificationToken();
    expect(a.startsWith("tigerhire-verify=")).toBe(true);
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).not.toBe(b);
  });

  it("verifyDnsTxt handles match, mismatch, NXDOMAIN", async () => {
    const { verifyDnsTxt } = await import("@/lib/sso/verification");
    expect(mockResolverCtor).toHaveBeenCalledTimes(0);
    mockResolveTxt.mockResolvedValueOnce([["tigerhire-verify=abc"]]);
    await expect(verifyDnsTxt("acme.com", "tigerhire-verify=abc")).resolves.toBe(true);
    expect(mockSetServers).toHaveBeenCalledWith(["8.8.8.8", "1.1.1.1"]);

    mockResolveTxt.mockResolvedValueOnce([["other-token"]]);
    await expect(verifyDnsTxt("acme.com", "tigerhire-verify=abc")).resolves.toBe(false);

    mockResolveTxt.mockRejectedValueOnce(new Error("NXDOMAIN"));
    await expect(verifyDnsTxt("acme.com", "tigerhire-verify=abc")).resolves.toBe(false);
  });
});
