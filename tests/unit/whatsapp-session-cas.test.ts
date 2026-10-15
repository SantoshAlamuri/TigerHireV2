import { beforeEach, describe, expect, it, vi } from "vitest";

// Hand-rolled supabase chain mock. The sessions module hits two query shapes:
//   read:  from("whatsapp_sessions").select("*").eq("phone", x).single()
//   touch: from("whatsapp_sessions").update({...}).eq("id", x)               (awaited)
//   cas:   from("whatsapp_sessions").update({...}).eq("phone", x).eq("version", v).select("id")
//
// We deliberately implement `.eq()` so the chain is awaitable at each
// terminal call AND chainable for the CAS path.
type SelectResult = { data: Array<{ id: string }> | null; error: { message: string } | null };

const mockReadSingle = vi.fn();
const mockCASSelect = vi.fn<[], Promise<SelectResult>>();
// getOrCreateSession's insert-if-absent path: upsert(...).select().maybeSingle().
const mockUpsertSingle = vi.fn();

const updatePayloads: Array<Record<string, unknown>> = [];
const updateEqCalls: Array<Array<[string, unknown]>> = [];

function buildFromChain() {
  const selectEq = vi.fn(() => ({ single: mockReadSingle, maybeSingle: mockReadSingle }));
  const select = vi.fn(() => ({ eq: selectEq }));

  // For UPDATE chain, .eq returns a thenable that ALSO has .eq + .select for CAS.
  // The touch path awaits after the first .eq; the CAS path chains a second .eq
  // before .select.
  function makeUpdateEqChain(eqCalls: Array<[string, unknown]>) {
    const chain: {
      eq: (col: string, val: unknown) => typeof chain;
      select: (cols?: string) => Promise<SelectResult>;
      then: <T, R>(
        onFulfilled?: ((v: { error: null }) => T) | null,
        onRejected?: ((reason: unknown) => R) | null,
      ) => Promise<T | R>;
    } = {
      eq: (col: string, val: unknown) => {
        eqCalls.push([col, val]);
        return chain;
      },
      select: () => mockCASSelect(),
      then: (onFulfilled, onRejected) =>
        Promise.resolve({ error: null }).then(onFulfilled ?? undefined, onRejected ?? undefined),
    };
    return chain;
  }

  const update = vi.fn((payload: Record<string, unknown>) => {
    updatePayloads.push(payload);
    const eqCalls: Array<[string, unknown]> = [];
    updateEqCalls.push(eqCalls);
    return makeUpdateEqChain(eqCalls);
  });

  const insertSingle = vi.fn();
  const insertSelect = vi.fn(() => ({ single: insertSingle }));
  const insert = vi.fn(() => ({ select: insertSelect }));

  // upsert(payload, opts).select().maybeSingle()
  const upsertSelect = vi.fn(() => ({ single: mockUpsertSingle, maybeSingle: mockUpsertSingle }));
  const upsert = vi.fn(() => ({ select: upsertSelect }));

  return { select, selectEq, update, insert, upsert };
}

let fromChain = buildFromChain();
const mockFrom = vi.fn(() => fromChain);

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: mockFrom }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/lib/whatsapp/normalize-phone", () => ({
  normalizeIndianPhone: (raw: string) => raw.replace(/\D/g, ""),
}));

import {
  getOrCreateSession,
  SessionConflictError,
  updateSession,
  withSessionCAS,
  type WhatsAppSession,
} from "@/lib/whatsapp/sessions";

const PHONE = "919876543210";

function makeSession(overrides: Partial<WhatsAppSession> = {}): WhatsAppSession {
  return {
    id: "sess-1",
    phone: PHONE,
    session_state: "new",
    context: {},
    last_message_at: "2026-06-17T00:00:00.000Z",
    created_at: "2026-06-17T00:00:00.000Z",
    version: 5,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fromChain = buildFromChain();
  mockFrom.mockReturnValue(fromChain);
  mockReadSingle.mockReset();
  mockCASSelect.mockReset();
  mockUpsertSingle.mockReset();
  updatePayloads.length = 0;
  updateEqCalls.length = 0;
});

describe("updateSession optimistic concurrency", () => {
  it("happy path: bumps version + filters on phone + expectedVersion", async () => {
    mockCASSelect.mockResolvedValueOnce({ data: [{ id: "sess-1" }], error: null });

    await expect(updateSession(PHONE, "cv_requested", { foo: "bar" }, 7)).resolves.toBeUndefined();

    expect(updatePayloads.length).toBe(1);
    expect(updatePayloads[0]).toMatchObject({
      session_state: "cv_requested",
      context: { foo: "bar" },
      version: 8,
    });
    expect(updateEqCalls[0]).toEqual([
      ["phone", PHONE],
      ["version", 7],
    ]);
  });

  it("throws SessionConflictError when zero rows match (lost race)", async () => {
    mockCASSelect.mockResolvedValueOnce({ data: [], error: null });

    await expect(updateSession(PHONE, "cv_requested", {}, 3)).rejects.toBeInstanceOf(
      SessionConflictError,
    );
  });

  it("throws generic error on supabase error (not conflict)", async () => {
    mockCASSelect.mockResolvedValueOnce({ data: null, error: { message: "db down" } });

    await expect(updateSession(PHONE, "cv_requested", {}, 0)).rejects.toThrow(
      "Failed to update WhatsApp session",
    );
  });
});

describe("withSessionCAS", () => {
  it("happy path (no contention): one read, one successful CAS", async () => {
    mockReadSingle.mockResolvedValueOnce({ data: makeSession({ version: 5 }), error: null });
    mockCASSelect.mockResolvedValueOnce({ data: [{ id: "sess-1" }], error: null });

    const mutate = vi.fn().mockReturnValue({
      state: "cv_requested" as const,
      context: { hello: "world" },
    });

    const result = await withSessionCAS(PHONE, mutate);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(result?.session_state).toBe("cv_requested");
    expect(result?.context).toEqual({ hello: "world" });

    // CAS UPDATE was filtered on the version we read (5).
    const casUpdatePayloads = updatePayloads.filter((p) => p.session_state === "cv_requested");
    expect(casUpdatePayloads[0]?.version).toBe(6);
  });

  it("conflict on first attempt, success on retry", async () => {
    mockReadSingle
      .mockResolvedValueOnce({ data: makeSession({ version: 5 }), error: null })
      .mockResolvedValueOnce({ data: makeSession({ version: 6 }), error: null });
    mockCASSelect
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ id: "sess-1" }], error: null });

    const mutate = vi.fn().mockReturnValue({
      state: "cv_requested" as const,
      context: {},
    });

    const result = await withSessionCAS(PHONE, mutate);
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(result?.session_state).toBe("cv_requested");
  });

  it("3 conflicts in a row throws SessionConflictError", async () => {
    mockReadSingle
      .mockResolvedValueOnce({ data: makeSession({ version: 5 }), error: null })
      .mockResolvedValueOnce({ data: makeSession({ version: 6 }), error: null })
      .mockResolvedValueOnce({ data: makeSession({ version: 7 }), error: null });
    mockCASSelect
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const mutate = vi.fn().mockReturnValue({
      state: "cv_requested" as const,
      context: {},
    });

    await expect(withSessionCAS(PHONE, mutate)).rejects.toBeInstanceOf(SessionConflictError);
    expect(mutate).toHaveBeenCalledTimes(3);
  });

  it("returns null and skips CAS UPDATE when mutate returns null", async () => {
    mockReadSingle.mockResolvedValueOnce({ data: makeSession({ version: 5 }), error: null });

    const mutate = vi.fn().mockReturnValue(null);

    const result = await withSessionCAS(PHONE, mutate);
    expect(result).toBeNull();
    expect(mockCASSelect).not.toHaveBeenCalled();
  });
});

describe("getOrCreateSession race safety", () => {
  it("returns the existing row on insert conflict instead of throwing", async () => {
    // 1) initial read: no existing session row
    mockReadSingle.mockResolvedValueOnce({ data: null, error: null });
    // 2) insert-if-absent lost the race (ON CONFLICT DO NOTHING → no row)
    mockUpsertSingle.mockResolvedValueOnce({ data: null, error: null });
    // 3) re-select finds the row the winning isolate created
    mockReadSingle.mockResolvedValueOnce({
      data: makeSession({ version: 0, session_state: "new" }),
      error: null,
    });

    const session = await getOrCreateSession(PHONE);
    expect(session.session_state).toBe("new");
    expect(session.version).toBe(0);
  });

  it("returns the freshly inserted row when it wins the race", async () => {
    mockReadSingle.mockResolvedValueOnce({ data: null, error: null });
    mockUpsertSingle.mockResolvedValueOnce({
      data: makeSession({ version: 0, session_state: "new" }),
      error: null,
    });

    const session = await getOrCreateSession(PHONE);
    expect(session.session_state).toBe("new");
  });
});
