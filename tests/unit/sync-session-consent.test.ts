import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WhatsAppSession } from "@/lib/whatsapp/sessions";

const mockHasAllRequiredConsent = vi.fn();
const mockUpdateSession = vi.fn();

vi.mock("@/lib/repositories/ConsentRepository", () => ({
  ConsentRepository: {
    hasAllRequiredConsent: (...args: unknown[]) => mockHasAllRequiredConsent(...args),
  },
}));

vi.mock("@/lib/whatsapp/sessions", () => ({
  updateSession: (...args: unknown[]) => mockUpdateSession(...args),
  withSessionCAS: vi.fn(async (phone: string, mutate: (s: unknown) => unknown) => {
    const outcome = await mutate({ version: 0, context: {} });
    if (!outcome) return null;
    const o = outcome as { state: string; context: Record<string, unknown>; extras?: unknown };
    if (o.extras === undefined) await mockUpdateSession(phone, o.state, o.context);
    else await mockUpdateSession(phone, o.state, o.context, o.extras);
    return { session_state: o.state, context: o.context };
  }),
  SessionConflictError: class SessionConflictError extends Error {},
}));

function session(overrides: Partial<WhatsAppSession> = {}): WhatsAppSession {
  return {
    id: "sess-1",
    phone: "919876543210",
    session_state: "awaiting_consent",
    context: { referred_by: "user-1" },
    last_message_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    version: 0,
    ...overrides,
  };
}

describe("sync-session-consent", () => {
  const supabase = {} as never;

  beforeEach(() => {
    mockHasAllRequiredConsent.mockReset();
    mockUpdateSession.mockReset();
    mockUpdateSession.mockResolvedValue(undefined);
  });

  describe("syncSessionWithConsent", () => {
    it("advances awaiting_consent to cv_requested when consent exists", async () => {
      mockHasAllRequiredConsent.mockResolvedValue(true);
      const { syncSessionWithConsent } = await import("@/lib/whatsapp/sync-session-consent");
      const s = session({ session_state: "awaiting_consent", context: { job_id: "j1" } });

      const result = await syncSessionWithConsent(supabase, "919876543210", s);

      expect(result).toEqual({ advanced: true });
      expect(mockUpdateSession).toHaveBeenCalledWith(
        "919876543210",
        "cv_requested",
        { job_id: "j1" },
        expect.any(Number),
      );
    });

    it("advances new and consent_given states when consent exists", async () => {
      mockHasAllRequiredConsent.mockResolvedValue(true);
      const { syncSessionWithConsent } = await import("@/lib/whatsapp/sync-session-consent");

      for (const state of ["new", "consent_given"] as const) {
        mockUpdateSession.mockClear();
        const result = await syncSessionWithConsent(
          supabase,
          "919876543210",
          session({ session_state: state }),
        );
        expect(result).toEqual({ advanced: true });
        expect(mockUpdateSession).toHaveBeenCalledWith(
          "919876543210",
          "cv_requested",
          expect.any(Object),
          expect.any(Number),
        );
      }
    });

    it("does not advance when consent is missing", async () => {
      mockHasAllRequiredConsent.mockResolvedValue(false);
      const { syncSessionWithConsent } = await import("@/lib/whatsapp/sync-session-consent");

      const result = await syncSessionWithConsent(
        supabase,
        "919876543210",
        session({ session_state: "awaiting_consent" }),
      );

      expect(result).toEqual({ advanced: false });
      expect(mockUpdateSession).not.toHaveBeenCalled();
    });

    it("does not advance cv_requested or other post-consent states", async () => {
      mockHasAllRequiredConsent.mockResolvedValue(true);
      const { syncSessionWithConsent } = await import("@/lib/whatsapp/sync-session-consent");

      const result = await syncSessionWithConsent(
        supabase,
        "919876543210",
        session({ session_state: "cv_requested" }),
      );

      expect(result).toEqual({ advanced: false });
      expect(mockHasAllRequiredConsent).not.toHaveBeenCalled();
      expect(mockUpdateSession).not.toHaveBeenCalled();
    });
  });

  describe("prepareSessionAfterEmployeeReferral", () => {
    it("sets cv_requested when consent exists", async () => {
      mockHasAllRequiredConsent.mockResolvedValue(true);
      const { prepareSessionAfterEmployeeReferral } =
        await import("@/lib/whatsapp/sync-session-consent");

      const state = await prepareSessionAfterEmployeeReferral(supabase, "919876543210", {
        referred_by: "emp-1",
      });

      expect(state).toBe("cv_requested");
      expect(mockUpdateSession).toHaveBeenCalledWith("919876543210", "cv_requested", {
        referred_by: "emp-1",
      });
    });

    it("sets awaiting_consent when consent is missing", async () => {
      mockHasAllRequiredConsent.mockResolvedValue(false);
      const { prepareSessionAfterEmployeeReferral } =
        await import("@/lib/whatsapp/sync-session-consent");

      const state = await prepareSessionAfterEmployeeReferral(supabase, "919876543210", {
        employee_referral_id: "ref-1",
      });

      expect(state).toBe("awaiting_consent");
      expect(mockUpdateSession).toHaveBeenCalledWith("919876543210", "awaiting_consent", {
        employee_referral_id: "ref-1",
      });
    });
  });
});
