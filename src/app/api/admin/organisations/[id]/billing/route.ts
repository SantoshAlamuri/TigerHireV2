import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  jsonError,
  jsonSuccess,
  handleApiError,
  parseJsonBody,
  handleZodError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { requirePlatformAdmin } from "@/lib/security/platform-admin";
import { getManualBillingState } from "@/lib/services/manual-billing";
import { adminOrgBillingProfileSchema } from "@/lib/validations/organisations";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await requirePlatformAdmin(_request);
    if (auth.error) return auth.error;

    const state = await getManualBillingState(id);
    const admin = createSupabaseAdmin();
    const { data: ledgerRows } = await admin
      .from("organisation_credit_ledger")
      .select(
        "id, credit_type, entry_type, delta, balance_after, reason, reference_type, reference_id, created_by, created_at",
      )
      .eq("organisation_id", id)
      .order("created_at", { ascending: false })
      .limit(30);

    return jsonSuccess({
      organisationId: id,
      profile: state.profile,
      wallet: state.wallet,
      ledger: ledgerRows ?? [],
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch organisation billing profile", {
      route: "GET /api/admin/organisations/[id]/billing",
    });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const { id } = await params;
    const auth = await requirePlatformAdmin(request);
    if (auth.error) return auth.error;

    const parsedBody = await parseJsonBody(request, "PATCH /api/admin/organisations/[id]/billing");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = adminOrgBillingProfileSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const admin = createSupabaseAdmin();
    const payload = parsed.data;
    const { data, error } = await admin
      .from("organisation_billing_profiles")
      .upsert(
        {
          organisation_id: id,
          billing_mode: payload.billingMode,
          customer_type: payload.customerType,
          unlock_credits_monthly: payload.unlockCreditsMonthly,
          job_credits_monthly: payload.jobCreditsMonthly,
          allow_negative_balance: payload.allowNegativeBalance,
          notes: payload.notes ?? null,
          updated_by: auth.context.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organisation_id" },
      )
      .select(
        "organisation_id, billing_mode, customer_type, unlock_credits_monthly, job_credits_monthly, allow_negative_balance, notes",
      )
      .single();

    if (error) return jsonError("Failed to update billing profile", 500);
    return jsonSuccess({ profile: data });
  } catch (err) {
    return handleApiError(err, "Failed to update organisation billing profile", {
      route: "PATCH /api/admin/organisations/[id]/billing",
    });
  }
}
