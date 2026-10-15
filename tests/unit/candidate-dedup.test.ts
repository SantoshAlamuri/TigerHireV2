import { describe, it, expect, vi } from "vitest";
import {
  findExistingCandidate,
  normalizePhoneForCandidate,
  claimUnclaimedCandidateByPhone,
} from "@/lib/agents/candidate-dedup";

describe("normalizePhoneForCandidate", () => {
  it("returns digits-only canonical phone", () => {
    expect(normalizePhoneForCandidate("+91 (98765) 43210")).toBe("919876543210");
  });

  it("returns null for empty/invalid inputs", () => {
    expect(normalizePhoneForCandidate("   ")).toBeNull();
    expect(normalizePhoneForCandidate(null)).toBeNull();
    expect(normalizePhoneForCandidate(undefined)).toBeNull();
  });
});

describe("findExistingCandidate", () => {
  it("matches by exact normalized phone and returns candidate id", async () => {
    const eq = vi.fn().mockImplementation((_column: string, value: string) => {
      expect(value).toBe("919876543210");
      return {
        limit: () => Promise.resolve({ data: [{ id: "cand-1" }], error: null }),
      };
    });

    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq }),
      }),
    };

    const candidateId = await findExistingCandidate(
      supabase as never,
      {
        email: null,
        phone: "+91 98765 43210",
      },
      { matchByName: false },
    );

    expect(candidateId).toBe("cand-1");
  });

  it("does not match when phone only shares suffix", async () => {
    const eq = vi.fn().mockImplementation((_column: string, value: string) => {
      expect(value).toBe("9876543210");
      return {
        limit: () => Promise.resolve({ data: [], error: null }),
      };
    });

    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq }),
      }),
    };

    const candidateId = await findExistingCandidate(
      supabase as never,
      {
        email: null,
        phone: "9876543210",
      },
      { matchByName: false },
    );

    expect(candidateId).toBeNull();
  });
});

describe("claimUnclaimedCandidateByPhone", () => {
  it("claims an unclaimed candidate row keyed by normalized phone", async () => {
    const updateEq = vi.fn().mockReturnValue({
      is: vi.fn().mockResolvedValue({ error: null }),
    });
    const update = vi.fn((patch: Record<string, unknown>) => {
      expect(patch).toMatchObject({ user_id: "user-9", phone: "919876543210" });
      return { eq: updateEq };
    });
    // select().eq("phone", …).is("user_id", null).limit(1)
    const selectChain = {
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          limit: () => Promise.resolve({ data: [{ id: "cand-7" }], error: null }),
        }),
      }),
    };
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(selectChain),
        update,
      }),
    };

    const id = await claimUnclaimedCandidateByPhone(supabase as never, "user-9", "+91 98765 43210");
    expect(id).toBe("cand-7");
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("returns null when there is no unclaimed row for the phone", async () => {
    const selectChain = {
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    };
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(selectChain),
        update: vi.fn(),
      }),
    };

    const id = await claimUnclaimedCandidateByPhone(supabase as never, "user-9", "9876543210");
    expect(id).toBeNull();
  });

  it("returns null for an empty phone without querying", async () => {
    const from = vi.fn();
    const id = await claimUnclaimedCandidateByPhone({ from } as never, "user-9", "  ");
    expect(id).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
});
