import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

type Row = {
  key_hash: string;
  endpoint: string;
  response_status: number;
  response_body: Record<string, unknown>;
  created_at: string;
};

const store: { rows: Row[] } = { rows: [] };

function makeBuilder(table: string) {
  if (table !== "idempotency_keys") {
    throw new Error(`unexpected table: ${table}`);
  }

  // General chainable builder modelling supabase-js: eq/neq/gt collect filters,
  // update/delete stage a mutation applied when the chain is awaited, and
  // select terminates via maybeSingle/single.
  type Pred = (r: Row) => boolean;
  const preds: Pred[] = [];
  let op: "update" | "delete" | null = null;
  let patch: Partial<Row> = {};

  const matches = (r: Row) => preds.every((p) => p(r));

  const builder: Record<string, unknown> = {
    eq(col: keyof Row, val: unknown) {
      preds.push((r) => r[col] === val);
      return builder;
    },
    neq(col: keyof Row, val: unknown) {
      preds.push((r) => r[col] !== val);
      return builder;
    },
    gt(col: keyof Row, val: string) {
      preds.push((r) => String(r[col]) > val);
      return builder;
    },
    select() {
      return builder;
    },
    update(next: Partial<Row>) {
      op = "update";
      patch = next;
      return builder;
    },
    delete() {
      op = "delete";
      return builder;
    },
    async insert(row: Omit<Row, "created_at"> & { created_at?: string }) {
      const exists = store.rows.find(
        (r) => r.key_hash === row.key_hash && r.endpoint === row.endpoint,
      );
      if (exists) {
        return { error: { code: "23505", message: "duplicate" } };
      }
      store.rows.push({ ...row, created_at: row.created_at ?? new Date().toISOString() } as Row);
      return { error: null };
    },
    async maybeSingle() {
      const found = store.rows.find(matches);
      return { data: found ?? null, error: null };
    },
    async single() {
      const found = store.rows.find(matches);
      if (!found) return { data: null, error: { code: "PGRST116" } };
      return { data: found, error: null };
    },
    // Awaiting the chain applies a staged update/delete.
    then(resolve: (v: { error: null }) => void) {
      if (op === "update") {
        for (const r of store.rows) if (matches(r)) Object.assign(r, patch);
      } else if (op === "delete") {
        store.rows = store.rows.filter((r) => !matches(r));
      }
      resolve({ error: null });
    },
  };

  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (table: string) => makeBuilder(table),
  }),
}));

const { withIdempotency } = await import("@/lib/security/idempotency");

function reqWithKey(key?: string): Request {
  const headers = new Headers();
  if (key) headers.set("idempotency-key", key);
  return new Request("https://example.test/api/apply", { method: "POST", headers });
}

describe("withIdempotency TTL + don't-cache-failures", () => {
  beforeEach(() => {
    store.rows = [];
  });

  it("caches and replays a 2xx response on the second call with the same key", async () => {
    const handler = vi
      .fn()
      .mockResolvedValueOnce(NextResponse.json({ ok: true, n: 1 }, { status: 200 }))
      .mockResolvedValueOnce(NextResponse.json({ ok: true, n: 2 }, { status: 200 }));

    const first = await withIdempotency(reqWithKey("k-success"), "POST /api/apply", handler);
    const firstBody = await first.json();
    expect(first.status).toBe(200);
    expect(firstBody).toEqual({ ok: true, n: 1 });

    const second = await withIdempotency(reqWithKey("k-success"), "POST /api/apply", handler);
    const secondBody = await second.json();
    expect(second.status).toBe(200);
    // Replayed from cache → still n:1, not n:2. Handler should not have run twice.
    expect(secondBody).toEqual({ ok: true, n: 1 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does NOT cache a 400 — the second call with the same key re-runs the handler", async () => {
    const handler = vi
      .fn()
      .mockResolvedValueOnce(NextResponse.json({ error: "bad" }, { status: 400 }))
      .mockResolvedValueOnce(NextResponse.json({ ok: true }, { status: 200 }));

    const first = await withIdempotency(reqWithKey("k-fail"), "POST /api/apply", handler);
    expect(first.status).toBe(400);
    expect(store.rows).toHaveLength(0);

    const second = await withIdempotency(reqWithKey("k-fail"), "POST /api/apply", handler);
    expect(second.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("caches a 409 (semantic conflict) and replays it", async () => {
    const handler = vi
      .fn()
      .mockResolvedValueOnce(NextResponse.json({ error: "duplicate" }, { status: 409 }))
      .mockResolvedValueOnce(NextResponse.json({ ok: true }, { status: 200 }));

    const first = await withIdempotency(reqWithKey("k-conflict"), "POST /api/apply", handler);
    expect(first.status).toBe(409);

    const second = await withIdempotency(reqWithKey("k-conflict"), "POST /api/apply", handler);
    expect(second.status).toBe(409);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does NOT serve an expired (>24h) cached row even if present", async () => {
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    // Pre-seed an expired success row directly into the store, simulating a row that
    // the reaper hasn't deleted yet.
    const { createHash } = await import("crypto");
    const keyHash = createHash("sha256").update("k-expired").digest("hex");
    store.rows.push({
      key_hash: keyHash,
      endpoint: "POST /api/apply",
      response_status: 200,
      response_body: { ok: true, stale: true },
      created_at: stale,
    });

    const handler = vi.fn().mockResolvedValue(NextResponse.json({ fresh: true }, { status: 200 }));

    const res = await withIdempotency(reqWithKey("k-expired"), "POST /api/apply", handler);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ fresh: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
