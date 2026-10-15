import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

/**
 * The operator side of referral payouts.
 *
 * TigerHire disburses referral bonuses on the company's behalf, so the company
 * never touches payee bank details and never runs a payment file. The lifecycle:
 *
 *   pending    payout-trigger wrote it when the milestone fired
 *   confirmed  the company confirmed the hire is real (the only company step)
 *   paid       TigerHire disbursed it in a batch and recorded the reference
 *
 * Before this service, nothing anywhere advanced `status` past 'pending'.
 */

export type PayoutBatch = {
  id: string;
  reference: string;
  status: string;
  currency: string;
  total_amount: number;
  row_count: number;
  payment_reference: string | null;
  created_at: string;
  paid_at: string | null;
};

const BATCH_COLS =
  "id, reference, status, currency, total_amount, row_count, payment_reference, created_at, paid_at";

function monthPrefix(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `PR-${y}-${m}`;
}

/**
 * Sequence within the month. The UNIQUE constraint on `reference` is the real
 * guard — two operators generating a run in the same second both compute the
 * same next number, and the loser retries rather than silently reusing it.
 */
async function nextReference(admin: SupabaseClient, now: Date): Promise<string> {
  const prefix = monthPrefix(now);
  const { data } = await admin
    .from("payout_batches")
    .select("reference")
    .like("reference", `${prefix}-%`)
    .order("reference", { ascending: false })
    .limit(1);

  const last = data?.[0]?.reference as string | undefined;
  const lastSeq = last ? Number.parseInt(last.slice(prefix.length + 1), 10) : 0;
  const next = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
  return `${prefix}-${String(next).padStart(4, "0")}`;
}

/**
 * Company confirms the milestone actually happened. Scoped to the caller's org
 * by way of the job the payout was earned on: a row whose job belongs to another
 * tenant is not confirmable here, and rows with no job (pre-2026-08-01 backfill
 * misses) are not confirmable by anyone but a platform admin.
 */
export async function confirmPayouts(
  admin: SupabaseClient,
  args: {
    ledgerIds: string[];
    userId: string;
    organisationId: string | null;
    isSuperAdmin: boolean;
  },
): Promise<{ confirmed: number; skipped: number }> {
  const { ledgerIds, userId, organisationId, isSuperAdmin } = args;
  if (ledgerIds.length === 0) return { confirmed: 0, skipped: 0 };

  let allowed = ledgerIds;

  if (!isSuperAdmin) {
    if (!organisationId) return { confirmed: 0, skipped: ledgerIds.length };

    const { data: rows, error } = await admin
      .from("payout_ledger")
      .select("id, job_id")
      .in("id", ledgerIds);
    if (error) throw error;

    const jobIds = [...new Set((rows ?? []).map((r) => r.job_id).filter(Boolean))] as string[];
    if (jobIds.length === 0) return { confirmed: 0, skipped: ledgerIds.length };

    const { data: jobs, error: jobsErr } = await admin
      .from("jobs")
      .select("id")
      .in("id", jobIds)
      .eq("organisation_id", organisationId);
    if (jobsErr) throw jobsErr;

    const ownJobIds = new Set((jobs ?? []).map((j) => j.id as string));
    allowed = (rows ?? [])
      .filter((r) => r.job_id && ownJobIds.has(r.job_id as string))
      .map((r) => r.id as string);
  }

  if (allowed.length === 0) return { confirmed: 0, skipped: ledgerIds.length };

  // Only 'pending' advances. Re-confirming a row already in a run must not
  // reset it, so the status predicate is part of the write, not a pre-check.
  const { data: updated, error: updErr } = await admin
    .from("payout_ledger")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_by: userId,
      updated_at: new Date().toISOString(),
    })
    .in("id", allowed)
    .eq("status", "pending")
    .select("id");
  if (updErr) throw updErr;

  const confirmed = updated?.length ?? 0;
  logger.info("referral payouts confirmed", { userId, requested: ledgerIds.length, confirmed });
  return { confirmed, skipped: ledgerIds.length - confirmed };
}

/**
 * Claim every confirmed, unbatched row into a new run.
 *
 * The claim is the `batch_id IS NULL` predicate on the UPDATE, not a read
 * followed by a write: two operators pressing Generate at once each take a
 * disjoint set of rows instead of both paying the same referrer. Totals are
 * computed from what was actually claimed, and a run that claimed nothing is
 * deleted rather than left as an empty artefact.
 */
export async function generateBatch(
  admin: SupabaseClient,
  args: { userId: string; note?: string | null; now?: Date },
): Promise<PayoutBatch | null> {
  const now = args.now ?? new Date();
  const reference = await nextReference(admin, now);

  const { data: batch, error: batchErr } = await admin
    .from("payout_batches")
    .insert({
      reference,
      status: "open",
      note: args.note?.trim() || null,
      created_by: args.userId,
    })
    .select(BATCH_COLS)
    .single();
  if (batchErr) throw batchErr;

  const { data: claimed, error: claimErr } = await admin
    .from("payout_ledger")
    .update({ batch_id: batch.id, updated_at: now.toISOString() })
    .eq("status", "confirmed")
    .is("batch_id", null)
    .select("id, amount");
  if (claimErr) throw claimErr;

  const rows = claimed ?? [];
  if (rows.length === 0) {
    await admin.from("payout_batches").delete().eq("id", batch.id);
    logger.info("referral payout run generated empty; discarded", { userId: args.userId });
    return null;
  }

  const total = rows.reduce((sum, r) => {
    const amt = Number(r.amount ?? 0);
    return sum + (Number.isFinite(amt) ? amt : 0);
  }, 0);

  const { data: finalised, error: finErr } = await admin
    .from("payout_batches")
    .update({ total_amount: total, row_count: rows.length, updated_at: now.toISOString() })
    .eq("id", batch.id)
    .select(BATCH_COLS)
    .single();
  if (finErr) throw finErr;

  logger.info("referral payout run generated", {
    userId: args.userId,
    reference,
    rows: rows.length,
    total,
  });
  return finalised as PayoutBatch;
}

/**
 * Record that the run was disbursed. Money moves outside this app — an operator
 * pays via the rail they already use and enters the reference here. Guarded on
 * status='open' so a double submit cannot re-stamp a run's paid_at.
 */
export async function markBatchPaid(
  admin: SupabaseClient,
  args: { batchId: string; userId: string; paymentReference: string; now?: Date },
): Promise<PayoutBatch | null> {
  const now = args.now ?? new Date();
  const iso = now.toISOString();

  // Atomic: batch + ledger flip to 'paid' in one transaction (mark_payout_batch_paid).
  // The previous two-step (batch first, ledger second) could strand ledger rows at
  // 'confirmed' if the process died between writes, with the status='open' guard then
  // blocking any repair. See #344.
  const { data, error } = await admin.rpc("mark_payout_batch_paid", {
    p_batch_id: args.batchId,
    p_user_id: args.userId,
    p_payment_reference: args.paymentReference.trim(),
    p_now: iso,
  });
  if (error) throw error;

  const rows = (Array.isArray(data) ? data : data ? [data] : []) as PayoutBatch[];
  const batch = rows[0];
  if (!batch) return null;

  logger.info("referral payout run marked paid", {
    userId: args.userId,
    reference: batch.reference,
    rows: batch.row_count,
  });
  return batch;
}

export async function listBatches(admin: SupabaseClient, limit = 50): Promise<PayoutBatch[]> {
  const { data, error } = await admin
    .from("payout_batches")
    .select(BATCH_COLS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as PayoutBatch[];
}
