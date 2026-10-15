/** Node env: ConsentService pulls in server-only helpers via its import graph. */
// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockQueryBuilder, createMockSupabase } from "../helpers";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ConsentService imports WhatsApp send helpers at module load; stub them so importing
// the intake-consent policy (which imports ConsentService) doesn't drag in real SDKs.
vi.mock("@/lib/whatsapp/templates", () => ({ sendConsentRequest: vi.fn() }));
vi.mock("@/lib/services/whatsapp", () => ({
  sendWhatsAppMessage: vi.fn(),
  sendApplicationReceivedTemplate: vi.fn(),
}));
vi.mock("@/lib/whatsapp/message-log", () => ({ hasRecentInboundFromPhone: vi.fn() }));

type Row = {
  phone: string | null;
  candidate_id: string | null;
  consent_type: string;
  consent_given: boolean;
  consent_text: string;
  obtained_via: string;
  ip_address: string | null;
};

/** consent_records builder: maybeSingle drives the idempotency check, insert captures rows. */
function consentSupabase(existing: { id: string } | null) {
  const builder = createMockQueryBuilder({ data: existing });
  const supabase = createMockSupabase({ consent_records: builder });
  const insertedRows = (): Row[] =>
    (builder.insert as ReturnType<typeof vi.fn>).mock.calls.flatMap((c) => c[0] as Row[]);
  return { supabase, builder, insertedRows };
}

describe("recordIntakeConsent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("explicit opt-in (web form) writes consent_given=true via web_form for the required non-WA types", async () => {
    const { recordIntakeConsent } = await import("@/lib/consent/record-intake-consent");
    const { supabase, builder, insertedRows } = consentSupabase(null);

    const out = await recordIntakeConsent(supabase as any, {
      candidateId: "cand-1",
      source: "direct",
      consent: { given: true, ipAddress: "1.2.3.4" },
      whatsappOptIn: false,
    });

    expect(out.basis).toBe("explicit_opt_in");
    expect(builder.insert).toHaveBeenCalledTimes(1);
    const rows = insertedRows();
    expect(rows.every((r) => r.consent_given === true)).toBe(true);
    expect(rows.every((r) => r.obtained_via === "web_form")).toBe(true);
    expect(rows.every((r) => r.candidate_id === "cand-1")).toBe(true);
    expect(rows.every((r) => r.ip_address === "1.2.3.4")).toBe(true);
    expect(new Set(rows.map((r) => r.consent_type))).toEqual(
      new Set(["cv_processing", "profile_storage", "recruiter_visibility"]),
    );
    // whatsapp_communication must NOT be granted without the WA opt-in.
    expect(rows.some((r) => r.consent_type === "whatsapp_communication")).toBe(false);
  });

  it("explicit opt-in with whatsappOptIn also grants whatsapp_communication", async () => {
    const { recordIntakeConsent } = await import("@/lib/consent/record-intake-consent");
    const { supabase, insertedRows } = consentSupabase(null);

    await recordIntakeConsent(supabase as any, {
      candidateId: "cand-2",
      source: "direct",
      consent: { given: true },
      whatsappOptIn: true,
    });

    const types = new Set(insertedRows().map((r) => r.consent_type));
    expect(types.has("whatsapp_communication")).toBe(true);
  });

  it("email_intake (recruiter-submitted) writes a provenance basis: consent_given=false, only cv_processing", async () => {
    const { recordIntakeConsent } = await import("@/lib/consent/record-intake-consent");
    const { supabase, insertedRows } = consentSupabase(null);

    const out = await recordIntakeConsent(supabase as any, {
      candidateId: "cand-3",
      source: "email_intake",
      consent: null,
    });

    expect(out.basis).toBe("recruiter_submitted");
    const rows = insertedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].consent_given).toBe(false);
    expect(rows[0].obtained_via).toBe("email_intake");
    expect(rows[0].consent_type).toBe("cv_processing");
    expect(rows[0].consent_text.toLowerCase()).toContain("draft");
    // Must NOT assert recruiter_visibility on a recruiter-submitted basis.
    expect(rows.some((r) => r.consent_type === "recruiter_visibility")).toBe(false);
  });

  it("recruiter_upload / agency_upload record provenance keyed on their own source string", async () => {
    const { recordIntakeConsent } = await import("@/lib/consent/record-intake-consent");
    for (const source of ["recruiter_upload", "agency_upload"]) {
      const { supabase, insertedRows } = consentSupabase(null);
      await recordIntakeConsent(supabase as any, { candidateId: "c", source, consent: null });
      expect(insertedRows()[0].obtained_via).toBe(source);
      expect(insertedRows()[0].consent_given).toBe(false);
    }
  });

  it("is idempotent per (candidate_id, channel): skips insert when a row already exists for that channel", async () => {
    const { recordIntakeConsent } = await import("@/lib/consent/record-intake-consent");
    const { supabase, builder, insertedRows } = consentSupabase({ id: "existing-consent" });

    const out = await recordIntakeConsent(supabase as any, {
      candidateId: "cand-dup",
      source: "email_intake",
      consent: null,
    });

    expect(out.skipped).toBe(true);
    expect(out.written).toBe(0);
    expect(builder.insert).not.toHaveBeenCalled();
    expect(insertedRows()).toHaveLength(0);
  });
});

describe("recordIntakeConsentBestEffort", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never throws when the DB write fails, and logs a distinct warn", async () => {
    const { recordIntakeConsentBestEffort } = await import("@/lib/consent/record-intake-consent");
    const { logger } = await import("@/lib/observability/logger");

    // Builder whose insert path rejects: make maybeSingle resolve no-existing, but insert throw.
    const builder = createMockQueryBuilder({ data: null });
    (builder.insert as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("db down");
    });
    const supabase = createMockSupabase({ consent_records: builder });

    await expect(
      recordIntakeConsentBestEffort(supabase as any, {
        candidateId: "cand-x",
        source: "email_intake",
        consent: null,
      }),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      "Intake consent write failed (apply not blocked)",
      expect.objectContaining({ candidateId: "cand-x" }),
    );
  });
});
