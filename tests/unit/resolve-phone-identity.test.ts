import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  pickCanonicalCandidate,
  resolvePhoneIdentity,
  type ResolvedCandidate,
} from "@/lib/whatsapp/resolve-phone-identity";

function cand(over: Partial<ResolvedCandidate> & { id: string }): ResolvedCandidate {
  return {
    user_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    last_active_at: null,
    do_not_call: null,
    ...over,
  };
}

type Row = ResolvedCandidate & { erased_at: string | null };
function makeAdmin(data: Row[] | null, error: { message: string } | null = null) {
  const chain = {
    select: () => chain,
    eq: () => Promise.resolve({ data, error }),
  };
  return { from: () => chain } as never;
}

describe("pickCanonicalCandidate", () => {
  it("returns null for no rows", () => {
    expect(pickCanonicalCandidate([])).toBeNull();
  });

  it("prefers a claimed (user_id) row over an unclaimed one", () => {
    const chosen = pickCanonicalCandidate([
      cand({ id: "a", created_at: "2025-01-01T00:00:00Z" }),
      cand({ id: "b", user_id: "u1", created_at: "2026-06-01T00:00:00Z" }),
    ]);
    expect(chosen?.id).toBe("b");
  });

  it("among same claim-status, picks the earliest created (rediscovery-safe, not newest)", () => {
    const chosen = pickCanonicalCandidate([
      cand({ id: "new", created_at: "2026-07-01T00:00:00Z" }),
      cand({ id: "old", created_at: "2024-01-01T00:00:00Z" }),
    ]);
    // A re-ingested newer row must NOT win.
    expect(chosen?.id).toBe("old");
  });

  it("is stable — id ascending breaks a full tie", () => {
    const rows = [
      cand({ id: "zzz", created_at: "2025-01-01T00:00:00Z" }),
      cand({ id: "aaa", created_at: "2025-01-01T00:00:00Z" }),
    ];
    expect(pickCanonicalCandidate(rows)?.id).toBe("aaa");
    expect(pickCanonicalCandidate([...rows].reverse())?.id).toBe("aaa");
  });
});

describe("resolvePhoneIdentity", () => {
  it("returns empty for a too-short phone without querying", async () => {
    const res = await resolvePhoneIdentity(makeAdmin([]), "12345");
    expect(res).toEqual({ candidateId: null, candidate: null, total: 0, ambiguous: false });
  });

  it("returns empty on a query error", async () => {
    const res = await resolvePhoneIdentity(makeAdmin(null, { message: "boom" }), "919876543210");
    expect(res.candidateId).toBeNull();
    expect(res.total).toBe(0);
  });

  it("excludes erased candidates and flags ambiguity", async () => {
    const res = await resolvePhoneIdentity(
      makeAdmin([
        {
          ...cand({ id: "erased", created_at: "2023-01-01T00:00:00Z" }),
          erased_at: "2024-01-01T00:00:00Z",
        },
        { ...cand({ id: "keep-old", created_at: "2024-01-01T00:00:00Z" }), erased_at: null },
        { ...cand({ id: "keep-new", created_at: "2026-01-01T00:00:00Z" }), erased_at: null },
      ]),
      "919876543210",
    );
    // erased excluded; two live rows → ambiguous; earliest live wins.
    expect(res.total).toBe(2);
    expect(res.ambiguous).toBe(true);
    expect(res.candidateId).toBe("keep-old");
  });

  it("resolves a single candidate unambiguously", async () => {
    const res = await resolvePhoneIdentity(
      makeAdmin([{ ...cand({ id: "solo" }), erased_at: null }]),
      "919876543210",
    );
    expect(res.candidateId).toBe("solo");
    expect(res.ambiguous).toBe(false);
    expect(res.total).toBe(1);
  });
});
