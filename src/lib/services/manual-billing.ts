import { createSupabaseAdmin } from "@/lib/supabase/admin";

export type CreditType = "unlock" | "job";
export type CreditEntryType = "grant" | "consume" | "adjust" | "expire" | "reset";

export interface BillingProfile {
  organisation_id: string;
  billing_mode: "automated" | "manual";
  customer_type: string;
  unlock_credits_monthly: number;
  job_credits_monthly: number;
  allow_negative_balance: boolean;
  notes: string | null;
}

export interface BillingWallet {
  organisation_id: string;
  unlock_balance: number;
  job_balance: number;
}

function walletKey(type: CreditType): "unlock_balance" | "job_balance" {
  return type === "unlock" ? "unlock_balance" : "job_balance";
}

export async function ensureBillingProfileAndWallet(organisationId: string): Promise<void> {
  const admin = createSupabaseAdmin();
  await admin.from("organisation_billing_profiles").upsert(
    {
      organisation_id: organisationId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organisation_id" },
  );
  await admin.from("organisation_credit_wallets").upsert(
    {
      organisation_id: organisationId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organisation_id" },
  );
}

export async function getManualBillingState(organisationId: string): Promise<{
  profile: BillingProfile;
  wallet: BillingWallet;
}> {
  await ensureBillingProfileAndWallet(organisationId);
  const admin = createSupabaseAdmin();
  const [{ data: profile }, { data: wallet }] = await Promise.all([
    admin
      .from("organisation_billing_profiles")
      .select(
        "organisation_id, billing_mode, customer_type, unlock_credits_monthly, job_credits_monthly, allow_negative_balance, notes",
      )
      .eq("organisation_id", organisationId)
      .single(),
    admin
      .from("organisation_credit_wallets")
      .select("organisation_id, unlock_balance, job_balance")
      .eq("organisation_id", organisationId)
      .single(),
  ]);

  return {
    profile: profile as BillingProfile,
    wallet: wallet as BillingWallet,
  };
}

export async function adjustOrganisationCredits(params: {
  organisationId: string;
  creditType: CreditType;
  delta: number;
  entryType: CreditEntryType;
  reason: string;
  createdBy: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  allowNegativeOverride?: boolean;
}): Promise<{ balanceAfter: number }> {
  const admin = createSupabaseAdmin();
  await ensureBillingProfileAndWallet(params.organisationId);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [{ data: profile }, { data: wallet }] = await Promise.all([
      admin
        .from("organisation_billing_profiles")
        .select("allow_negative_balance")
        .eq("organisation_id", params.organisationId)
        .single(),
      admin
        .from("organisation_credit_wallets")
        .select("unlock_balance, job_balance")
        .eq("organisation_id", params.organisationId)
        .single(),
    ]);

    const key = walletKey(params.creditType);
    const current = Number((wallet as BillingWallet)[key] ?? 0);
    const next = current + params.delta;
    const allowNegative = params.allowNegativeOverride ?? Boolean(profile?.allow_negative_balance);
    if (next < 0 && !allowNegative) {
      throw new Error(
        `Insufficient ${params.creditType} credits: required ${Math.abs(params.delta)}, available ${current}`,
      );
    }

    const { data: updatedRows, error: updateError } = await admin
      .from("organisation_credit_wallets")
      .update({
        [key]: next,
        updated_at: new Date().toISOString(),
      })
      .eq("organisation_id", params.organisationId)
      .eq(key, current)
      .select(key);

    if (updateError) throw updateError;
    if (!updatedRows || updatedRows.length === 0) continue;

    const { error: ledgerError } = await admin.from("organisation_credit_ledger").insert({
      organisation_id: params.organisationId,
      credit_type: params.creditType,
      entry_type: params.entryType,
      delta: params.delta,
      balance_after: next,
      reason: params.reason,
      reference_type: params.referenceType ?? null,
      reference_id: params.referenceId ?? null,
      created_by: params.createdBy,
    });
    if (ledgerError) throw ledgerError;
    return { balanceAfter: next };
  }

  throw new Error("Credit wallet update contention; please retry");
}

export async function consumeManualCredits(params: {
  organisationId: string;
  creditType: CreditType;
  amount: number;
  reason: string;
  createdBy: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
}): Promise<{ applied: boolean; balanceAfter?: number; message?: string }> {
  const state = await getManualBillingState(params.organisationId);
  if (state.profile.billing_mode !== "manual") {
    return { applied: false };
  }
  if (params.amount <= 0) {
    return { applied: false, message: "Amount must be greater than zero" };
  }

  const result = await adjustOrganisationCredits({
    organisationId: params.organisationId,
    creditType: params.creditType,
    delta: -params.amount,
    entryType: "consume",
    reason: params.reason,
    createdBy: params.createdBy,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
  });
  return { applied: true, balanceAfter: result.balanceAfter };
}
