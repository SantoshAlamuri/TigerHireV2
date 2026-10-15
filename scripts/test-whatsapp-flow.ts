/**
 * End-to-end exercise of the WhatsApp candidate funnel using the real
 * `handleInboundMessage` implementation and Supabase (service role).
 *
 * ## Why Vitest instead of plain ts-node?
 * The handler binds `sendWhatsAppMessage` at import time. Replacing the export
 * after the fact does not change that binding, so we use `vi.mock` (Vitest) to
 * substitute `sendWhatsAppMessage` before the handler module is loaded.
 *
 * ## Run
 *   npm run test:whatsapp-flow
 *
 * Loads env from `.env.local` via the npm script (Node `--env-file`).
 * Equivalent: `npx vitest run --config vitest.whatsapp-flow.config.ts` (after exporting env vars).
 *
 * ## Env
 * - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (required)
 * - `E2E_WHATSAPP_TEST_PHONE` — optional, digits (default `911234567890`)
 * - `E2E_WHATSAPP_TEST_DOCUMENT_ID` — optional Meta **media id** of a PDF you
 *   already sent to the WhatsApp Business number; enables CV ingest → Q1
 *   (`WHATSAPP_ACCESS_TOKEN` must allow media download)
 * - `WHATSAPP_SANDBOX=true` recommended so consent templates do not hit Meta
 *
 * Consent rows live in **`consent_records`** (there is no `consents` table).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { InboundMessagePayload } from "@/lib/whatsapp/handler";

const REQUIRED_CONSENT_TYPES = [
  "cv_processing",
  "profile_storage",
  "recruiter_visibility",
  "whatsapp_communication",
] as const;

const SUPABASE_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
);

const TEST_PHONE_DIGITS = (process.env.E2E_WHATSAPP_TEST_PHONE ?? "911234567890").replace(
  /\D/g,
  "",
);
const DOCUMENT_MEDIA_ID = process.env.E2E_WHATSAPP_TEST_DOCUMENT_ID?.trim();

const { sendWhatsAppMessageMock } = vi.hoisted(() => {
  const sendWhatsAppMessageMock = vi.fn(
    async (_phone: string, _text: string): Promise<{ success: boolean }> => {
      return { success: true };
    },
  );
  return { sendWhatsAppMessageMock };
});

vi.mock("@/lib/services/whatsapp", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/services/whatsapp")>();
  return { ...mod, sendWhatsAppMessage: sendWhatsAppMessageMock };
});

function logStep(name: string, ok: boolean, detail?: string): void {
  const label = ok ? "PASS" : "FAIL";
  const suffix = detail ? ` — ${detail}` : "";

  console.log(`[${label}] ${name}${suffix}`);
}

function logSkip(name: string, detail?: string): void {
  const suffix = detail ? ` — ${detail}` : "";

  console.log(`[SKIP] ${name}${suffix}`);
}

function textPayload(messageId: string, body: string): InboundMessagePayload {
  return {
    messages: [
      {
        id: messageId,
        from: TEST_PHONE_DIGITS,
        type: "text",
        text: { body },
      },
    ],
    contacts: [{ wa_id: TEST_PHONE_DIGITS, profile: { name: "E2E Test User" } }],
  };
}

function documentPayload(messageId: string, mediaId: string): InboundMessagePayload {
  return {
    messages: [
      {
        id: messageId,
        from: TEST_PHONE_DIGITS,
        type: "document",
        document: {
          id: mediaId,
          filename: "e2e-cv.pdf",
          mime_type: "application/pdf",
        },
      },
    ],
    contacts: [{ wa_id: TEST_PHONE_DIGITS, profile: { name: "E2E Test User" } }],
  };
}

async function fetchSessionState(): Promise<string | null> {
  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from("whatsapp_sessions")
    .select("session_state")
    .eq("phone", TEST_PHONE_DIGITS)
    .maybeSingle();
  return (data?.session_state as string | undefined) ?? null;
}

async function countConsentRows(): Promise<number> {
  const supabase = createSupabaseAdmin();
  const { count, error } = await supabase
    .from("consent_records")
    .select("*", { count: "exact", head: true })
    .eq("phone", TEST_PHONE_DIGITS)
    .eq("consent_given", true)
    .in("consent_type", [...REQUIRED_CONSENT_TYPES]);
  if (error) throw error;
  return count ?? 0;
}

async function cleanupTestArtifacts(messageIds: string[]): Promise<void> {
  const supabase = createSupabaseAdmin();

  try {
    await supabase.from("whatsapp_message_log").delete().eq("phone", TEST_PHONE_DIGITS);
  } catch {
    /* table may be absent in older DBs */
  }

  if (messageIds.length > 0) {
    await supabase
      .from("agent_logs")
      .delete()
      .eq("agent_name", "scout")
      .in("input_ref", messageIds);
  }

  const { data: candidates } = await supabase
    .from("candidates")
    .select("id")
    .eq("phone", TEST_PHONE_DIGITS);
  for (const row of candidates ?? []) {
    const id = row.id as string;
    await supabase.from("candidate_preferences").delete().eq("candidate_id", id);
    await supabase.from("fit_scores").delete().eq("candidate_id", id);
  }

  await supabase.from("candidates").delete().eq("phone", TEST_PHONE_DIGITS);
  await supabase.from("consent_records").delete().eq("phone", TEST_PHONE_DIGITS);
  await supabase.from("whatsapp_sessions").delete().eq("phone", TEST_PHONE_DIGITS);
}

describe.skipIf(!SUPABASE_CONFIGURED)("WhatsApp hiring flow (handler E2E)", () => {
  const messageIds: string[] = [];

  beforeAll(async () => {
    await cleanupTestArtifacts([]);
  });

  afterAll(async () => {
    await cleanupTestArtifacts(messageIds);
  });

  it(
    "HI → consent → optional CV → optional preference Q1",
    { timeout: DOCUMENT_MEDIA_ID ? 180_000 : 60_000 },
    async () => {
      const { handleInboundMessage } = await import("@/lib/whatsapp/handler");
      sendWhatsAppMessageMock.mockClear();

      // --- Step 1: greeting → consent requested (template), session awaiting_consent
      const id1 = `e2e-wa-${Date.now()}-1`;
      messageIds.push(id1);
      await handleInboundMessage(textPayload(id1, "HI"));

      const stateAfterHi = await fetchSessionState();
      try {
        expect(stateAfterHi).toBe("awaiting_consent");
        logStep("Step 1: HI → whatsapp_sessions.state = awaiting_consent", true);
      } catch (e) {
        logStep("Step 1: HI → session state", false, String(e));
        throw e;
      }

      try {
        expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
        logStep("Step 1: no free-text sendWhatsAppMessage yet (consent is a template)", true);
      } catch (e) {
        logStep("Step 1: outbound text mock", false, String(e));
        throw e;
      }

      try {
        const consentCount = await countConsentRows();
        expect(consentCount).toBe(0);
        logStep("Step 1: consent_records empty before YES", true);
      } catch (e) {
        logStep("Step 1: consent_records", false, String(e));
        throw e;
      }

      // --- Step 2: YES → consent_records, welcome text, cv_requested
      const id2 = `e2e-wa-${Date.now()}-2`;
      messageIds.push(id2);
      await handleInboundMessage(textPayload(id2, "YES"));

      try {
        expect(await countConsentRows()).toBe(REQUIRED_CONSENT_TYPES.length);
        logStep(
          `Step 2: YES → consent_records has all ${REQUIRED_CONSENT_TYPES.length} required consents`,
          true,
        );
      } catch (e) {
        logStep("Step 2: consent_records after YES", false, String(e));
        throw e;
      }

      try {
        expect(await fetchSessionState()).toBe("cv_requested");
        logStep("Step 2: YES → whatsapp_sessions.state = cv_requested", true);
      } catch (e) {
        logStep("Step 2: session after YES", false, String(e));
        throw e;
      }

      try {
        expect(sendWhatsAppMessageMock).toHaveBeenCalled();
        const welcomeCall = sendWhatsAppMessageMock.mock.calls.find((c) =>
          String(c[1]).includes("Welcome to TigerHire"),
        );
        expect(welcomeCall?.[0]?.replace(/\D/g, "")).toBe(TEST_PHONE_DIGITS);
        expect(welcomeCall).toBeTruthy();
        logStep("Step 2: sendWhatsAppMessage welcome copy (TigerHire / CV)", true);
      } catch (e) {
        logStep("Step 2: outbound welcome via sendWhatsAppMessage", false, String(e));
        throw e;
      }

      try {
        const { data: cand } = await createSupabaseAdmin()
          .from("candidates")
          .select("id")
          .eq("phone", TEST_PHONE_DIGITS)
          .maybeSingle();
        expect(cand).toBeNull();
        logStep("Step 2: candidates row not created yet (CV not ingested)", true);
      } catch (e) {
        logStep("Step 2: candidates absence", false, String(e));
        throw e;
      }

      if (!DOCUMENT_MEDIA_ID) {
        logSkip(
          "Step 3: CV + job-info (Q1)",
          "set E2E_WHATSAPP_TEST_DOCUMENT_ID to a real Meta PDF media id (+ WHATSAPP_ACCESS_TOKEN for download)",
        );
        logSkip("Step 4: preference / job question (Q1)", "depends on Step 3");
        return;
      }

      // --- Step 3: PDF document → Scout ingest → candidate row
      const id3 = `e2e-wa-${Date.now()}-3`;
      messageIds.push(id3);
      const callsBeforeDoc = sendWhatsAppMessageMock.mock.calls.length;
      await handleInboundMessage(documentPayload(id3, DOCUMENT_MEDIA_ID));

      try {
        const supabase = createSupabaseAdmin();
        const { data: cand, error } = await supabase
          .from("candidates")
          .select("id")
          .eq("phone", TEST_PHONE_DIGITS)
          .maybeSingle();
        if (error) throw error;
        expect(cand?.id).toBeTruthy();
        logStep("Step 3: CV → candidates row exists for test phone", true);
      } catch (e) {
        logStep("Step 3: candidate after CV", false, String(e));
        throw e;
      }

      try {
        const postDocTexts = sendWhatsAppMessageMock.mock.calls
          .slice(callsBeforeDoc)
          .map((c) => String(c[1]));
        expect(postDocTexts.some((t) => t.includes("Got your CV"))).toBe(true);
        logStep("Step 3: outbound includes Got your CV…", true);
      } catch (e) {
        logStep("Step 3: outbound Got your CV", false, String(e));
        throw e;
      }

      try {
        const st = await fetchSessionState();
        expect(st).toBe("collecting_preferences");
        logStep("Step 3: whatsapp_sessions.state = collecting_preferences", true);
      } catch (e) {
        logStep(
          "Step 3: session after CV (expected collecting_preferences — check E2E_WHATSAPP_TEST_DOCUMENT_ID, PDF, scout_agent / consent_flow flags)",
          false,
          String(e),
        );
        throw e;
      }

      // --- Step 4: first preference question = job targeting (“job info” step)
      try {
        const q1Call = sendWhatsAppMessageMock.mock.calls.find((c) =>
          String(c[1]).startsWith("Q1:"),
        );
        expect(q1Call).toBeTruthy();
        expect(String(q1Call?.[1])).toContain("What type of role are you looking for");
        logStep("Step 4: outbound Q1 (role / job-info question)", true);
      } catch (e) {
        logStep("Step 4: Q1 outbound", false, String(e));
        throw e;
      }
    },
  );
});
