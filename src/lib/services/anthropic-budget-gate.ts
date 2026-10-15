import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { sendOpsAlert } from "@/lib/observability/alerts";

/**
 * Anthropic budget gate — INR-denominated, PER-ROLE primary cap.
 *
 * The unit of revenue is a role (₹5,000 flat / 1,000 profiles), so the unit of
 * cost-control is the role. assertWithinAnthropicBudget({ jobId }) checks that
 * role's accumulated Anthropic spend against the per-role cap BEFORE letting
 * callClaude fire. A viral job, or a bot hammering one job, is contained to that
 * one role's budget instead of the whole platform's allowance.
 *
 * The global day/month cap is a SECONDARY backstop: it catches a cross-role
 * systemic runaway (e.g. many roles each staying just under the per-role cap).
 * Disable it with ANTHROPIC_GLOBAL_CAP_DISABLED=true if you want per-role only.
 *
 * On breach, throws BudgetExceededError; callers catch this and degrade
 * gracefully (mark candidate "budget_pending", rank by embedding only, never a
 * 500). Source of truth: job_budget_state (per role) + budget_state (global),
 * written by record_*_anthropic_spend RPCs after each call.
 */

const DEFAULT_ROLE_CAP_INR = 3_500;
const DEFAULT_DAILY_CAP_INR = 10_000;
const DEFAULT_MONTHLY_CAP_INR = 100_000;
const DEFAULT_WARN_AT_PCT = 80;
/** Default FX used when converting USD → INR for the cap check. Tunable via env. */
const DEFAULT_USD_TO_INR = 85;
const STATE_CACHE_TTL_MS = 60_000;

export type BudgetWindow = "role" | "day" | "month";

export class BudgetExceededError extends Error {
  readonly window: BudgetWindow;
  readonly capInr: number;
  readonly spentInr: number;
  readonly jobId?: string;
  constructor(window: BudgetWindow, capInr: number, spentInr: number, jobId?: string) {
    super(
      `Anthropic ${window} budget exceeded${jobId ? ` (job ${jobId})` : ""}: spent ₹${spentInr.toFixed(2)} of ₹${capInr.toFixed(2)}`,
    );
    this.name = "BudgetExceededError";
    this.window = window;
    this.capInr = capInr;
    this.spentInr = spentInr;
    this.jobId = jobId;
  }
}

export function roleCapInr(): number {
  const raw = Number(process.env.ANTHROPIC_ROLE_CAP_INR ?? DEFAULT_ROLE_CAP_INR);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_ROLE_CAP_INR;
}

function dailyCapInr(): number {
  const raw = Number(process.env.ANTHROPIC_DAILY_CAP_INR ?? DEFAULT_DAILY_CAP_INR);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAILY_CAP_INR;
}

function monthlyCapInr(): number {
  const raw = Number(process.env.ANTHROPIC_MONTHLY_CAP_INR ?? DEFAULT_MONTHLY_CAP_INR);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MONTHLY_CAP_INR;
}

function warnAtPct(): number {
  const raw = Number(process.env.ANTHROPIC_WARN_AT_PCT ?? DEFAULT_WARN_AT_PCT);
  return Number.isFinite(raw) && raw > 0 && raw < 100 ? raw : DEFAULT_WARN_AT_PCT;
}

export function usdToInr(): number {
  const raw = Number(process.env.ANTHROPIC_USD_TO_INR ?? DEFAULT_USD_TO_INR);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_USD_TO_INR;
}

function isGateDisabled(): boolean {
  // Tests + emergencies — set ANTHROPIC_BUDGET_GATE_DISABLED=true to bypass.
  return process.env.ANTHROPIC_BUDGET_GATE_DISABLED === "true";
}

function isGlobalCapDisabled(): boolean {
  // Per-role-only mode. Set ANTHROPIC_GLOBAL_CAP_DISABLED=true to drop the
  // day/month backstop entirely.
  return process.env.ANTHROPIC_GLOBAL_CAP_DISABLED === "true";
}

// ----- Per-role spend cache -----------------------------------------------

interface RoleSpend {
  spendInr: number;
  capInr: number | null;
  fetchedAt: number;
}

const roleSpendCache = new Map<string, RoleSpend>();

async function fetchRoleSpend(jobId: string): Promise<RoleSpend> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("job_budget_state")
    .select("spend_inr_paise, cap_inr_paise")
    .eq("job_id", jobId)
    .maybeSingle();

  if (error) {
    // Do NOT reset spend to 0 on error — that disarms the cap exactly when the
    // DB is flaky. Reuse the last-known value if we have one (fail toward the
    // previously-observed spend, not toward zero).
    const prev = roleSpendCache.get(jobId);
    logger.error("anthropic_budget_gate: role spend fetch failed — reusing last-known", {
      jobId,
      error: error.message,
      hadCache: Boolean(prev),
    });
    if (prev) return { ...prev, fetchedAt: Date.now() };
    return { spendInr: 0, capInr: null, fetchedAt: Date.now() };
  }

  return {
    spendInr: (Number(data?.spend_inr_paise ?? 0) || 0) / 100,
    capInr: data?.cap_inr_paise != null ? Number(data.cap_inr_paise) / 100 : null,
    fetchedAt: Date.now(),
  };
}

async function getRoleSpend(jobId: string): Promise<RoleSpend> {
  const cached = roleSpendCache.get(jobId);
  if (cached && Date.now() - cached.fetchedAt < STATE_CACHE_TTL_MS) {
    return cached;
  }
  const fresh = await fetchRoleSpend(jobId);
  roleSpendCache.set(jobId, fresh);
  return fresh;
}

// ----- Global day/month spend cache ---------------------------------------

interface GlobalSnapshot {
  daySpendInr: number;
  monthSpendInr: number;
  fetchedAt: number;
}

let cachedGlobalSnapshot: GlobalSnapshot | null = null;

async function fetchGlobalSnapshot(): Promise<GlobalSnapshot> {
  const supabase = createSupabaseAdmin();
  const todayUtc = new Date().toISOString().slice(0, 10);
  const monthStart = `${todayUtc.slice(0, 7)}-01`;

  const { data, error } = await supabase
    .from("budget_state")
    .select("window_kind, window_start_utc, spend_inr_paise")
    .in("window_kind", ["day", "month"])
    .in("window_start_utc", [todayUtc, monthStart]);

  if (error) {
    // Preserve last-known spend rather than resetting to zero (which would let
    // the daily/monthly cap wave everything through during a DB blip).
    logger.error("anthropic_budget_gate: global state fetch failed — reusing last-known", {
      error: error.message,
      hadCache: Boolean(cachedGlobalSnapshot),
    });
    if (cachedGlobalSnapshot) {
      return { ...cachedGlobalSnapshot, fetchedAt: Date.now() };
    }
    return { daySpendInr: 0, monthSpendInr: 0, fetchedAt: Date.now() };
  }

  let dayPaise = 0;
  let monthPaise = 0;
  for (const row of (data ?? []) as Array<{
    window_kind: string;
    window_start_utc: string;
    spend_inr_paise: number;
  }>) {
    if (row.window_kind === "day" && row.window_start_utc === todayUtc) {
      dayPaise = Number(row.spend_inr_paise) || 0;
    } else if (row.window_kind === "month" && row.window_start_utc === monthStart) {
      monthPaise = Number(row.spend_inr_paise) || 0;
    }
  }
  return {
    daySpendInr: dayPaise / 100,
    monthSpendInr: monthPaise / 100,
    fetchedAt: Date.now(),
  };
}

async function getGlobalSnapshot(): Promise<GlobalSnapshot> {
  if (cachedGlobalSnapshot && Date.now() - cachedGlobalSnapshot.fetchedAt < STATE_CACHE_TTL_MS) {
    return cachedGlobalSnapshot;
  }
  cachedGlobalSnapshot = await fetchGlobalSnapshot();
  return cachedGlobalSnapshot;
}

export function invalidateBudgetSnapshotCache(): void {
  cachedGlobalSnapshot = null;
  roleSpendCache.clear();
}

// ----- The gate -----------------------------------------------------------

/**
 * Block-or-pass decision for the next Claude call. Checks the PER-ROLE cap
 * first (when jobId is given), then the global day/month backstop. Throws
 * BudgetExceededError on breach; logs a warn alert at the threshold.
 */
export async function assertWithinAnthropicBudget(opts?: {
  jobId?: string | null;
  organisationId?: string | null;
}): Promise<void> {
  if (isGateDisabled()) return;

  // Primary: per-role cap.
  const jobId = opts?.jobId ?? null;
  if (jobId) {
    const role = await getRoleSpend(jobId);
    const cap = role.capInr ?? roleCapInr();
    if (role.spendInr >= cap) {
      throw new BudgetExceededError("role", cap, role.spendInr, jobId);
    }
    if (role.spendInr >= cap * (warnAtPct() / 100)) {
      await maybeSendRoleWarn(jobId, role.spendInr, cap);
    }
  }

  // Secondary: global day/month backstop.
  if (!isGlobalCapDisabled()) {
    const snap = await getGlobalSnapshot();
    const dCap = dailyCapInr();
    const mCap = monthlyCapInr();
    if (snap.daySpendInr >= dCap) {
      throw new BudgetExceededError("day", dCap, snap.daySpendInr);
    }
    if (snap.monthSpendInr >= mCap) {
      throw new BudgetExceededError("month", mCap, snap.monthSpendInr);
    }
  }
}

async function maybeSendRoleWarn(jobId: string, spentInr: number, capInr: number): Promise<void> {
  const supabase = createSupabaseAdmin();
  // Atomic claim so we alert once per role, not every call past the threshold.
  const { data, error } = await supabase
    .from("job_budget_state")
    .update({ warn_alert_sent_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .is("warn_alert_sent_at", null)
    .select("job_id");
  if (error || !data?.length) return;

  await sendOpsAlert(
    `Anthropic role spend crossed ${warnAtPct()}% for job ${jobId} — ₹${spentInr.toFixed(2)} of ₹${capInr.toFixed(2)}`,
  ).catch((err) => logger.warn("ops_alert: role budget warn failed", { error: String(err) }));
}

/**
 * Record a Claude call's cost into both the per-role and global spend tables.
 * Called by callClaude after each successful response.
 */
export async function recordAnthropicCallSpend(opts: {
  costUsd: number;
  jobId?: string | null;
  organisationId?: string | null;
}): Promise<void> {
  const { costUsd, jobId, organisationId } = opts;
  if (!Number.isFinite(costUsd) || costUsd <= 0) return;
  const inr = costUsd * usdToInr();
  const costInrPaise = Math.round(inr * 100);
  const costUsdMicros = Math.round(costUsd * 1_000_000);
  if (costInrPaise <= 0 && costUsdMicros <= 0) return;

  const supabase = createSupabaseAdmin();

  // Per-role (primary). Only when the call is attributable to a job.
  if (jobId) {
    try {
      const { error } = await supabase.rpc("record_job_anthropic_spend", {
        p_job_id: jobId,
        p_organisation_id: organisationId ?? null,
        p_cost_inr_paise: costInrPaise,
        p_cost_usd_micros: costUsdMicros,
      });
      if (error) {
        logger.warn("anthropic_budget_gate: record_job_anthropic_spend failed", {
          jobId,
          error: error.message,
        });
      } else {
        roleSpendCache.delete(jobId);
      }
    } catch (err) {
      logger.warn("anthropic_budget_gate: record_job_anthropic_spend threw", {
        jobId,
        error: String(err),
      });
    }
  }

  // Global (backstop) — always recorded so the day/month rollup is complete.
  try {
    const { error } = await supabase.rpc("record_anthropic_spend", {
      p_cost_inr_paise: costInrPaise,
      p_cost_usd_micros: costUsdMicros,
    });
    if (error) {
      logger.warn("anthropic_budget_gate: record_anthropic_spend failed", {
        error: error.message,
      });
    } else {
      cachedGlobalSnapshot = null;
    }
  } catch (err) {
    logger.warn("anthropic_budget_gate: record_anthropic_spend threw", { error: String(err) });
  }
}
