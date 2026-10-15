import { logger } from "./logger";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

async function sendToSlack(text: string): Promise<void> {
  if (!SLACK_WEBHOOK_URL) return;
  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    logger.warn("Slack webhook failed", { error: String(err) });
  }
}

/** Generic operational alert to Slack (if webhook configured). */
export async function sendOpsAlert(text: string): Promise<void> {
  logger.warn("OPS_ALERT", { message: text });
  await sendToSlack(text);
}

/**
 * Fire an alert when a single agent run costs more than INR 50
 * or when other cost anomalies are detected.
 * Logs always; optionally sends to Slack when SLACK_WEBHOOK_URL is set.
 */
export async function sendCostAlert(
  agent: string,
  costInr: number,
  refId: string | null,
): Promise<void> {
  const message = `COST_ALERT: agent run exceeded INR 50 — agent=${agent} cost_inr=${costInr} job_id=${refId ?? "n/a"}`;
  logger.error("COST_ALERT: agent run exceeded INR 50 threshold", {
    agent,
    cost_inr: costInr,
    job_id: refId ?? undefined,
  });
  await sendToSlack(message);
}

/**
 * Check daily aggregate cost and alert if over INR 800.
 * Intended to be called from a cron or after each agent run.
 */
export async function checkDailyCostThreshold(
  supabase: import("@supabase/supabase-js").SupabaseClient,
): Promise<void> {
  // agent_logs has no `cost_inr` column — it never has. The select was rejected
  // whole, `data` came back null, the total was always 0, and this alert has
  // therefore never fired no matter what the day's spend was.
  //
  // budget_state is the actual rollup ("Daily + monthly Anthropic spend
  // rollup"), maintained atomically by record_anthropic_spend() after every
  // callClaude. It stores paise, so divide to compare against a rupee threshold.
  const todayUtc = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from("budget_state")
    .select("spend_inr_paise")
    .eq("window_kind", "day")
    .eq("window_start_utc", todayUtc)
    .maybeSingle<{ spend_inr_paise: number | null }>();

  const total = Math.round((data?.spend_inr_paise ?? 0) / 100);

  if (total > 800) {
    const message = `COST_ALERT: daily spend exceeded INR 800 — total=${total}`;
    logger.error("COST_ALERT: daily spend exceeded INR 800", {
      cost_inr: total,
    });
    await sendToSlack(message);
  }
}
