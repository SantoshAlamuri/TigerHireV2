import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  pickActiveApplicationForInbound,
  resolveApplicationIdForInboundPhone,
} from "@/lib/whatsapp/inbound-application-resolution";

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(),
}));

import { createSupabaseAdmin } from "@/lib/supabase/admin";

describe("pickActiveApplicationForInbound", () => {
  it("returns null when no active statuses", () => {
    const r = pickActiveApplicationForInbound([
      { id: "a", status: "rejected", updated_at: "2026-01-01T00:00:00Z" },
    ]);
    expect(r.chosenId).toBeNull();
    expect(r.ambiguous).toBe(false);
  });

  it("picks most recently updated among active", () => {
    const r = pickActiveApplicationForInbound([
      { id: "old", status: "applied", updated_at: "2025-01-01T00:00:00Z" },
      { id: "newer", status: "shortlisted", updated_at: "2026-03-15T00:00:00Z" },
    ]);
    expect(r.chosenId).toBe("newer");
    expect(r.ambiguous).toBe(true);
    expect(r.allActiveIds).toContain("old");
    expect(r.allActiveIds).toContain("newer");
  });

  it("single active -> no ambiguity", () => {
    const r = pickActiveApplicationForInbound([
      { id: "x", status: "viewed", updated_at: "2026-01-02T00:00:00Z" },
    ]);
    expect(r.chosenId).toBe("x");
    expect(r.ambiguous).toBe(false);
  });
});

describe("resolveApplicationIdForInboundPhone (DB mock)", () => {
  const mockFrom = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createSupabaseAdmin).mockReturnValue({ from: mockFrom } as never);
  });

  it("returns no candidate when no rows for phone", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
    });
    const out = await resolveApplicationIdForInboundPhone("9999999999999");
    expect(out.applicationId).toBeNull();
  });

  it("returns application id for single active app", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "candidates") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [
                  { id: "c1", user_id: null, created_at: "2025-01-01T00:00:00Z", erased_at: null },
                ],
                error: null,
              }),
          }),
        };
      }
      if (table === "applications") {
        return {
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "app-1",
                      status: "applied",
                      updated_at: "2026-04-01T00:00:00Z",
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        };
      }
      return { select: () => ({}) };
    });

    const out = await resolveApplicationIdForInboundPhone("919876543210");
    expect(out.applicationId).toBe("app-1");
    expect(out.ambiguous).toBe(false);
  });

  it("returns null when candidate exists but no active application rows", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "candidates") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [
                  { id: "c1", user_id: null, created_at: "2025-01-01T00:00:00Z", erased_at: null },
                ],
                error: null,
              }),
          }),
        };
      }
      if (table === "applications") {
        return {
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    { id: "a1", status: "rejected", updated_at: "2026-01-01T00:00:00Z" },
                    { id: "a2", status: "withdrawn", updated_at: "2026-02-01T00:00:00Z" },
                  ],
                  error: null,
                }),
            }),
          }),
        };
      }
      return { select: () => ({}) };
    });

    const out = await resolveApplicationIdForInboundPhone("911234567890");
    expect(out.applicationId).toBeNull();
    expect(out.ambiguous).toBe(false);
  });

  it("marks ambiguous when several active applications exist", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "candidates") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [
                  { id: "c1", user_id: null, created_at: "2025-01-01T00:00:00Z", erased_at: null },
                ],
                error: null,
              }),
          }),
        };
      }
      if (table === "applications") {
        return {
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    { id: "a-old", status: "applied", updated_at: "2025-12-01T00:00:00Z" },
                    { id: "a-new", status: "shortlisted", updated_at: "2026-06-01T00:00:00Z" },
                  ],
                  error: null,
                }),
            }),
          }),
        };
      }
      return { select: () => ({}) };
    });

    const out = await resolveApplicationIdForInboundPhone("9111111111111");
    expect(out.applicationId).toBe("a-new");
    expect(out.ambiguous).toBe(true);
    expect(out.allActiveApplicationIds).toEqual(expect.arrayContaining(["a-old", "a-new"]));
  });
});
