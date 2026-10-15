/**
 * Live monitor for Masai Lead BA shortlisted prescreen WhatsApp dispatch.
 * Polls prescreen_sessions + whatsapp_message_log until stable or timeout.
 *
 *   NODE_OPTIONS='--conditions=react-server' npx tsx --env-file=.env.local scripts/monitor-masai-prescreen-send.ts
 */
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const LEAD_BA_JOB_ID = "b863d72c-fc73-4842-8a9d-d5d84eff63e3";
const POLL_MS = 5_000;
const MAX_POLLS = 120; // 10 minutes

async function snapshot(admin: ReturnType<typeof createSupabaseAdmin>) {
  const since = new Date(Date.now() - 30 * 60_000).toISOString();

  const { data: sessions } = await admin
    .from("prescreen_sessions")
    .select("state")
    .eq("job_id", LEAD_BA_JOB_ID);

  const byState: Record<string, number> = {};
  for (const s of sessions ?? []) {
    const st = String(s.state ?? "unknown");
    byState[st] = (byState[st] ?? 0) + 1;
  }

  const { data: logs } = await admin
    .from("whatsapp_message_log")
    .select("delivery_status, body_preview, created_at")
    .eq("direction", "outbound")
    .gte("created_at", since)
    .ilike("body_preview", "%th_shortlisted%");

  const delivery: Record<string, number> = {};
  for (const l of logs ?? []) {
    const st = String(l.delivery_status ?? "pending");
    delivery[st] = (delivery[st] ?? 0) + 1;
  }

  return {
    sessions: byState,
    sessionTotal: sessions?.length ?? 0,
    invites: logs?.length ?? 0,
    delivery,
  };
}

async function main() {
  const admin = createSupabaseAdmin();
  console.log("Monitoring Masai Lead BA prescreen send (poll every 5s)…\n");

  let lastSessionTotal = -1;
  let lastInvites = -1;

  for (let i = 0; i < MAX_POLLS; i++) {
    const s = await snapshot(admin);
    const ts = new Date().toLocaleTimeString();

    if (s.sessionTotal !== lastSessionTotal || s.invites !== lastInvites || i === 0) {
      console.log(
        `[${ts}] sessions=${s.sessionTotal} ${JSON.stringify(s.sessions)} | th_shortlisted sent=${s.invites} delivery=${JSON.stringify(s.delivery)}`,
      );
      lastSessionTotal = s.sessionTotal;
      lastInvites = s.invites;
    }

    const awaitingConsent = s.sessions["awaiting_consent"] ?? 0;
    if (awaitingConsent >= 160 && s.invites >= 160) {
      console.log("\nBulk invite dispatch looks complete (≥160 awaiting_consent).");
      break;
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
