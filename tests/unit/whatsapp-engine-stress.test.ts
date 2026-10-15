import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Concurrency / stress suite for the WhatsApp inbound engine.
 *
 * It drives the REAL webhook route and the REAL session helpers against a
 * stateful in-memory fake that faithfully models the three atomic DB primitives
 * that decide correctness under load:
 *   1. the idempotency claim  (webhook_event_try_acquire — insert-once)
 *   2. insert-if-absent       (upsert ON CONFLICT (phone) DO NOTHING)
 *   3. version CAS            (UPDATE ... WHERE phone=? AND version=?)
 *
 * Every terminal DB op yields a microtask (`tick()`) before it applies, so
 * concurrent `Promise.all` callers genuinely interleave at read/write boundaries
 * — that is what surfaces races a plain mock would hide.
 */

type SessionRow = {
  id: string;
  phone: string;
  session_state: string;
  context: Record<string, unknown>;
  last_message_at: string;
  created_at: string;
  version: number;
  qa_step?: number;
  alerts_expires_at?: string | null;
  alert_last_sent_at?: string | null;
  organisation_id?: string | null;
};

const tick = () => Promise.resolve();
const NOW = "2026-07-15T00:00:00.000Z";

function makeFakeDb() {
  const sessions = new Map<string, SessionRow>();
  const claims = new Set<string>();
  let seq = 0;
  const config = { claimErrorEventIds: new Set<string>() };

  async function rpc(name: string, args: { p_provider: string; p_event_id: string }) {
    await tick();
    if (name !== "webhook_event_try_acquire") return { data: null, error: null };
    if (config.claimErrorEventIds.has(args.p_event_id)) {
      return { data: null, error: { message: "injected claim error" } };
    }
    const key = `${args.p_provider}:${args.p_event_id}`;
    if (claims.has(key)) return { data: false, error: null };
    claims.add(key);
    return { data: true, error: null };
  }

  function applyUpdate(row: Record<string, unknown>, eqs: Array<[string, unknown]>) {
    const byId = eqs.find(([c]) => c === "id");
    const byPhone = eqs.find(([c]) => c === "phone");
    const byVersion = eqs.find(([c]) => c === "version");

    if (byId && !byVersion) {
      // touch (last_message_at) — find by id
      for (const s of sessions.values()) {
        if (s.id === byId[1]) Object.assign(s, row);
      }
      return { data: null, error: null };
    }
    if (byPhone && byVersion) {
      // optimistic CAS
      const s = sessions.get(String(byPhone[1]));
      if (s && s.version === byVersion[1]) {
        Object.assign(s, row);
        return { data: [{ id: s.id }], error: null };
      }
      return { data: [], error: null };
    }
    if (byPhone) {
      const s = sessions.get(String(byPhone[1]));
      if (s) Object.assign(s, row);
      return { data: null, error: null };
    }
    return { data: null, error: null };
  }

  function updateBuilder(row: Record<string, unknown>) {
    const eqs: Array<[string, unknown]> = [];
    const chain = {
      eq(col: string, val: unknown) {
        eqs.push([col, val]);
        return chain;
      },
      select() {
        return (async () => {
          await tick();
          return applyUpdate(row, eqs);
        })();
      },
      then(onF?: (v: { error: unknown }) => unknown, onR?: (r: unknown) => unknown) {
        return (async () => {
          await tick();
          const res = applyUpdate(row, eqs);
          return { error: res.error };
        })().then(onF, onR);
      },
    };
    return chain;
  }

  function selectBuilder() {
    return {
      eq(col: string, val: unknown) {
        const terminal = async () => {
          await tick();
          if (col === "phone") {
            return { data: sessions.get(String(val)) ?? null, error: null };
          }
          return { data: null, error: null };
        };
        return { maybeSingle: terminal, single: terminal };
      },
    };
  }

  function upsertBuilder(row: Record<string, unknown>) {
    return {
      select() {
        const terminal = async () => {
          await tick();
          const phone = String(row.phone);
          if (sessions.has(phone)) return { data: null, error: null }; // ON CONFLICT DO NOTHING
          const created: SessionRow = {
            id: `sess-${(seq += 1)}`,
            phone,
            session_state: String(row.session_state ?? "new"),
            context: (row.context as Record<string, unknown>) ?? {},
            last_message_at: NOW,
            created_at: NOW,
            version: 0,
          };
          sessions.set(phone, created);
          return { data: created, error: null };
        };
        return { maybeSingle: terminal, single: terminal };
      },
    };
  }

  function from(_table: string) {
    return {
      select: () => selectBuilder(),
      update: (row: Record<string, unknown>) => updateBuilder(row),
      upsert: (row: Record<string, unknown>) => upsertBuilder(row),
    };
  }

  return { from, rpc, config, __sessions: sessions, __claims: claims };
}

let db: ReturnType<typeof makeFakeDb>;
const mockHandler = vi.fn(async () => {
  await tick();
});

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => db,
}));
vi.mock("@/lib/whatsapp/handler", () => ({
  handleInboundMessage: (...args: unknown[]) => mockHandler(...args),
}));
vi.mock("@/lib/services/whatsapp", () => ({
  sendTypingIndicator: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/whatsapp/template-status-store", () => ({
  upsertTemplateStatusFromWebhook: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/whatsapp/normalize-phone", () => ({
  normalizeIndianPhone: (raw: string) => raw.replace(/\D/g, ""),
}));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (fn: () => void | Promise<void>) => {
      const out = fn();
      return out && typeof (out as Promise<void>).then === "function"
        ? (out as Promise<void>)
        : Promise.resolve();
    },
  };
});

function signBody(secret: string, raw: string): string {
  return `sha256=${createHmac("sha256", secret).update(raw, "utf8").digest("hex")}`;
}

function messageBody(messages: Array<{ id?: string; from?: string; text?: string }>) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: messages.map((m) => ({
                from: m.from ?? "919876543210",
                id: m.id,
                type: "text",
                text: { body: m.text ?? "APPLY" },
              })),
            },
          },
        ],
      },
    ],
  };
}

async function postBody(body: unknown) {
  const { POST } = await import("@/app/api/webhooks/whatsapp/route");
  const raw = JSON.stringify(body);
  const req = new NextRequest("http://localhost:3000/api/webhooks/whatsapp", {
    method: "POST",
    headers: { "x-hub-signature-256": signBody("unit-test-app-secret", raw) },
    body: raw,
  });
  return POST(req);
}

beforeEach(() => {
  db = makeFakeDb();
  mockHandler.mockClear();
  process.env.WHATSAPP_META_APP_SECRET = "unit-test-app-secret";
  process.env.WHATSAPP_WEBHOOK_SECRET = "unit-test-verify-token";
});

describe("stress: webhook idempotency under concurrent duplicate delivery", () => {
  it("processes a message exactly once across 100 concurrent duplicate deliveries", async () => {
    const body = messageBody([{ id: "wamid.dup", from: "919000000001" }]);
    const results = await Promise.all(Array.from({ length: 100 }, () => postBody(body)));

    // Exactly one handler run; every response is a benign 200.
    expect(mockHandler).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(db.__claims.size).toBe(1);
  });

  it("processes each distinct id once across a chaotic mix of 200 concurrent deliveries", async () => {
    // 40 unique ids, each delivered a random 1-8 times, all fired concurrently.
    const ids = Array.from({ length: 40 }, (_, i) => `wamid.chaos-${i}`);
    const deliveries: unknown[] = [];
    for (const id of ids) {
      const copies = 1 + (id.charCodeAt(id.length - 1) % 8);
      for (let c = 0; c < copies; c += 1) {
        deliveries.push(messageBody([{ id, from: "919000000002" }]));
      }
    }
    const results = await Promise.all(deliveries.map((b) => postBody(b)));

    expect(mockHandler).toHaveBeenCalledTimes(ids.length);
    const handledIds = new Set(
      mockHandler.mock.calls.map(
        (c) => (c[0] as { messages: Array<{ id: string }> }).messages[0].id,
      ),
    );
    expect(handledIds).toEqual(new Set(ids));
    expect(results.every((r) => r.status === 200)).toBe(true);
  });
});

describe("stress: batched payloads of varying size", () => {
  it.each([1, 2, 5, 25, 100])("processes every message in a batch of %i", async (size) => {
    const messages = Array.from({ length: size }, (_, i) => ({
      id: `wamid.batch-${size}-${i}`,
      from: "919000000003",
    }));
    const res = await postBody(messageBody(messages));
    expect(res.status).toBe(200);
    expect(mockHandler).toHaveBeenCalledTimes(size);
  });
});

describe("stress: fail-closed on idempotency claim error", () => {
  it("503s the batch on a claim error and never processes the failing message, then succeeds on retry", async () => {
    db.config.claimErrorEventIds.add("wamid.flaky");
    const body = messageBody([{ id: "wamid.flaky", from: "919000000004" }]);

    const first = await postBody(body);
    expect(first.status).toBe(503);
    expect(mockHandler).not.toHaveBeenCalled();

    // Meta redelivers after the DB recovers.
    db.config.claimErrorEventIds.clear();
    const retry = await postBody(body);
    expect(retry.status).toBe(200);
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  it("dispatches healthy siblings but 503s when one message in a batch errors", async () => {
    db.config.claimErrorEventIds.add("wamid.mixed-bad");
    const res = await postBody(
      messageBody([
        { id: "wamid.mixed-ok", from: "919000000005" },
        { id: "wamid.mixed-bad", from: "919000000005" },
      ]),
    );
    expect(res.status).toBe(503);
    expect(mockHandler).toHaveBeenCalledTimes(1);
    expect(
      (mockHandler.mock.calls[0][0] as { messages: Array<{ id: string }> }).messages[0].id,
    ).toBe("wamid.mixed-ok");
  });
});

describe("stress: getOrCreateSession first-message race", () => {
  it("creates exactly one row and never throws under 100 concurrent first-messages", async () => {
    const { getOrCreateSession } = await import("@/lib/whatsapp/sessions");
    const phone = "919111111111";
    const settled = await Promise.allSettled(
      Array.from({ length: 100 }, () => getOrCreateSession(phone)),
    );
    expect(settled.every((s) => s.status === "fulfilled")).toBe(true);
    expect(db.__sessions.size).toBe(1);
    const row = db.__sessions.get(phone.replace(/\D/g, ""));
    expect(row).toBeTruthy();
  });
});

describe("stress: withSessionCAS contention", () => {
  it("never loses an update among the writers that succeed (correct-use mutate)", async () => {
    const { getOrCreateSession, withSessionCAS } = await import("@/lib/whatsapp/sessions");
    const phone = "919222222222";
    await getOrCreateSession(phone); // seed the row at version 0

    const CONCURRENCY = 6;
    const settled = await Promise.allSettled(
      Array.from({ length: CONCURRENCY }, () =>
        withSessionCAS(phone, (session) => {
          // Correct usage: merge from the freshly-read session.
          const n = typeof session.context.n === "number" ? session.context.n : 0;
          return {
            state: session.session_state as never,
            context: { ...session.context, n: n + 1 },
          };
        }),
      ),
    );

    const fulfilled = settled.filter((s) => s.status === "fulfilled").length;
    const finalN = db.__sessions.get(phone.replace(/\D/g, ""))?.context.n;
    // Every writer that committed contributed exactly +1 — no lost updates.
    expect(finalN).toBe(fulfilled);
    expect(fulfilled).toBeGreaterThanOrEqual(1);
  });

  // A faithful model of the handler's bug (audit: concurrency #1): each inbound
  // "invocation" reads the session at entry, snapshots its context, then commits
  // {...snapshot, key} via CAS — the mutate IGNORES the CAS-fresh session, as
  // 27 of 28 handler.ts sites do. Two invocations racing on one phone both read
  // the same stale snapshot, so one field is clobbered.
  async function fakeInboundInvocation(
    session: typeof import("@/lib/whatsapp/sessions"),
    phone: string,
    key: string,
  ) {
    const s = await session.getOrCreateSession(phone);
    const snapshot = { ...s.context };
    await session.withSessionCAS(phone, () => ({
      state: "new" as never,
      context: { ...snapshot, [key]: 1 },
    }));
  }

  it("[known-defect] concurrent stale-closure invocations lose a writer's field", async () => {
    const session = await import("@/lib/whatsapp/sessions");
    const phone = "919333333333";
    await session.getOrCreateSession(phone);

    await Promise.allSettled([
      fakeInboundInvocation(session, phone, "a"),
      fakeInboundInvocation(session, phone, "b"),
    ]);

    const ctx = db.__sessions.get(phone.replace(/\D/g, ""))?.context ?? {};
    // The bug: both invocations read the same stale snapshot, so one key is clobbered.
    expect("a" in ctx && "b" in ctx).toBe(false);
    expect("a" in ctx || "b" in ctx).toBe(true);
  });

  it("[fix] serialized invocations (durable per-phone worker) preserve both fields", async () => {
    const session = await import("@/lib/whatsapp/sessions");
    const phone = "919444444444";
    await session.getOrCreateSession(phone);

    // The Inngest inbound worker runs same-phone events with
    // concurrency:{key:phone,limit:1} — strictly one at a time. Model that as
    // sequential execution: the second invocation reads the first's committed
    // write at entry, so nothing is clobbered.
    await fakeInboundInvocation(session, phone, "a");
    await fakeInboundInvocation(session, phone, "b");

    const ctx = db.__sessions.get(phone.replace(/\D/g, ""))?.context ?? {};
    expect("a" in ctx && "b" in ctx).toBe(true);
  });
});
