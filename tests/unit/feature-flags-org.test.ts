import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Per-org feature flag override resolution.
 *
 * Verifies the live two-tier resolver (`isEnabled`) against the REAL override
 * table `organisation_runtime_feature_flag_overrides`:
 *   org override (for key+org) wins -> global feature_flags row -> false.
 *
 * No new table: this asserts the capability that already exists end-to-end.
 */

// Force the DB path (no Redis short-circuit) and make cache writes no-ops.
vi.mock("@/lib/redis/cache", () => ({
  cacheGet: vi.fn(async () => null),
  cacheSet: vi.fn(async () => undefined),
  cacheDel: vi.fn(async () => undefined),
  cacheDelByPattern: vi.fn(async () => undefined),
}));

// Fixtures, swapped per test.
let globalFlags: Record<string, boolean> = {};
let orgOverrides: Record<string, boolean> = {}; // `${orgId}:${flagKey}` -> enabled

function resolveRow(table: string, filters: Record<string, string>) {
  if (table === "feature_flags") {
    const key = filters.key;
    return key in globalFlags
      ? { data: { enabled: globalFlags[key] }, error: null }
      : { data: null, error: null };
  }
  if (table === "organisation_runtime_feature_flag_overrides") {
    const composite = `${filters.organisation_id}:${filters.flag_key}`;
    return composite in orgOverrides
      ? { data: { enabled: orgOverrides[composite] }, error: null }
      : { data: null, error: null };
  }
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from(table: string) {
      const filters: Record<string, string> = {};
      const builder = {
        select: () => builder,
        eq: (col: string, val: string) => {
          filters[col] = val;
          return builder;
        },
        in: () => builder,
        single: async () => resolveRow(table, filters),
        maybeSingle: async () => resolveRow(table, filters),
      };
      return builder;
    },
  }),
}));

import { isEnabled, clearFlagCache } from "@/lib/feature-flags";

const KEY = "ff_whatsapp_gate";
const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  globalFlags = {};
  orgOverrides = {};
  clearFlagCache();
});

describe("per-org feature flag override resolution", () => {
  it("1. no override, global ON -> enabled (org and non-org calls agree)", async () => {
    globalFlags[KEY] = true;
    await expect(isEnabled(KEY, ORG_A)).resolves.toBe(true);
    await expect(isEnabled(KEY)).resolves.toBe(true);
  });

  it("2. no override, global OFF -> disabled", async () => {
    globalFlags[KEY] = false;
    await expect(isEnabled(KEY, ORG_A)).resolves.toBe(false);
    await expect(isEnabled(KEY)).resolves.toBe(false);
  });

  it("3. override ON, global OFF -> enabled for that org only", async () => {
    globalFlags[KEY] = false;
    orgOverrides[`${ORG_A}:${KEY}`] = true;
    await expect(isEnabled(KEY, ORG_A)).resolves.toBe(true);
    await expect(isEnabled(KEY, ORG_B)).resolves.toBe(false); // no override for B
    await expect(isEnabled(KEY)).resolves.toBe(false); // global path unchanged
  });

  it("4. override OFF, global ON -> disabled for that org; others stay ON", async () => {
    globalFlags[KEY] = true;
    orgOverrides[`${ORG_A}:${KEY}`] = false;
    await expect(isEnabled(KEY, ORG_A)).resolves.toBe(false);
    await expect(isEnabled(KEY, ORG_B)).resolves.toBe(true);
  });

  it("5. unknown key, no rows -> false", async () => {
    await expect(isEnabled("ff_does_not_exist", ORG_A)).resolves.toBe(false);
    await expect(isEnabled("ff_does_not_exist")).resolves.toBe(false);
  });

  it("6. no organisationId passed -> identical to global (override ignored)", async () => {
    globalFlags[KEY] = false;
    orgOverrides[`${ORG_A}:${KEY}`] = true; // override exists but must be ignored without org
    await expect(isEnabled(KEY)).resolves.toBe(false);
    // and the same global default holds regardless of the override row
    globalFlags[KEY] = true;
    clearFlagCache();
    await expect(isEnabled(KEY)).resolves.toBe(true);
  });
});
