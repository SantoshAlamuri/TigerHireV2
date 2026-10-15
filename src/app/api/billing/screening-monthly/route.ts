import { NextRequest } from "next/server";
import { handleApiError, jsonError, jsonSuccess } from "@/lib/api-helpers";
import { logger } from "@/lib/observability/logger";
import { withCorrelation } from "@/lib/observability/with-correlation";
import { withRouteSpan } from "@/lib/observability/route-span";
import { createRazorpayInvoice } from "@/lib/services/razorpay";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type VoiceJobRow = {
  id: string;
  organisation_id: string;
  charge_inr: number | string | null;
};

type SubscriptionRow = {
  organisation_id: string | null;
  provider_customer_id: string | null;
};

type SyncLogRow = { id: number };

function toNumber(value: number | string | null): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function getPreviousMonthWindow(): { startIso: string; endIso: string; monthLabel: string } {
  const now = new Date();
  const startCurrentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const startPrevMonth = new Date(
    Date.UTC(startCurrentMonth.getUTCFullYear(), startCurrentMonth.getUTCMonth() - 1, 1, 0, 0, 0),
  );
  const monthLabel = startPrevMonth.toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return {
    startIso: startPrevMonth.toISOString(),
    endIso: startCurrentMonth.toISOString(),
    monthLabel,
  };
}

function missingColumnError(message: string): boolean {
  return /column .* does not exist|Could not find/i.test(message);
}

async function authorizeCronRequest(request: NextRequest): Promise<boolean> {
  if (await validateCronSecret(request)) return true;
  const dedicatedSecret = (process.env.SCREENING_BILLING_CRON_SECRET ?? "").trim();
  if (!dedicatedSecret) return false;
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  return bearer === dedicatedSecret;
}

async function createSyncLog(startedAt: string): Promise<number | null> {
  const admin = createSupabaseAdmin();
  const withPipeline = await admin
    .from("sync_logs")
    .insert({
      source: "screening_monthly_billing",
      pipeline: "screening_billing",
      started_at: startedAt,
    })
    .select("id")
    .maybeSingle<SyncLogRow>();

  if (!withPipeline.error) return withPipeline.data?.id ?? null;
  if (!missingColumnError(withPipeline.error.message ?? "")) throw withPipeline.error;

  const fallback = await admin
    .from("sync_logs")
    .insert({
      source: "screening_monthly_billing",
      started_at: startedAt,
    })
    .select("id")
    .maybeSingle<SyncLogRow>();

  if (fallback.error) throw fallback.error;
  return fallback.data?.id ?? null;
}

async function completeSyncLog(
  logId: number | null,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!logId) return;
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("sync_logs").update(payload).eq("id", logId);
  if (error) {
    logger.warn("Failed to update sync log for screening billing", {
      log_id: logId,
      error: error.message,
    });
  }
}

const handler = withCorrelation(async (request: NextRequest) =>
  withRouteSpan("GET /api/billing/screening-monthly", async () => {
    const startedAt = new Date().toISOString();
    let syncLogId: number | null = null;

    try {
      const authorized = await authorizeCronRequest(request);
      if (!authorized) return jsonError("Unauthorized", 401);

      syncLogId = await createSyncLog(startedAt);
      const admin = createSupabaseAdmin();
      const { startIso, endIso, monthLabel } = getPreviousMonthWindow();

      const { data: organisations, error: organisationsError } = await admin
        .from("organisations")
        .select("id")
        .eq("voice_screening_enabled", true);
      if (organisationsError) throw organisationsError;

      const enabledOrganisationIds = new Set((organisations ?? []).map((row) => String(row.id)));
      if (enabledOrganisationIds.size === 0) {
        await completeSyncLog(syncLogId, {
          ended_at: new Date().toISOString(),
          jobs_fetched: 0,
          jobs_inserted: 0,
          jobs_updated: 0,
          jobs_dropped: 0,
          error: null,
        });
        return jsonSuccess({
          ok: true,
          message: "No voice-enabled organisations found for billing",
          window: { startIso, endIso, monthLabel },
          tenantsBilled: 0,
          jobsBilled: 0,
          amountInr: 0,
        });
      }

      const { data: jobs, error: jobsError } = await admin
        .from("screening_jobs")
        .select("id, organisation_id, charge_inr")
        .eq("mode", "voice")
        .eq("status", "completed")
        .is("billed_at", null)
        .gte("ended_at", startIso)
        .lt("ended_at", endIso);
      if (jobsError) throw jobsError;

      const candidates = (jobs ?? []).filter((job) =>
        enabledOrganisationIds.has(String(job.organisation_id)),
      ) as VoiceJobRow[];
      if (candidates.length === 0) {
        await completeSyncLog(syncLogId, {
          ended_at: new Date().toISOString(),
          jobs_fetched: 0,
          jobs_inserted: 0,
          jobs_updated: 0,
          jobs_dropped: 0,
          error: null,
        });
        return jsonSuccess({
          ok: true,
          message: "No unbilled completed voice jobs found",
          window: { startIso, endIso, monthLabel },
          tenantsBilled: 0,
          jobsBilled: 0,
          amountInr: 0,
        });
      }

      const organisationIds = Array.from(enabledOrganisationIds);
      const { data: subscriptions, error: subscriptionError } = await admin
        .from("subscriptions")
        .select("organisation_id, provider_customer_id")
        .eq("provider", "razorpay")
        .eq("status", "active")
        .in("organisation_id", organisationIds);
      if (subscriptionError) throw subscriptionError;

      const customerByTenant = new Map<string, string>();
      for (const row of (subscriptions ?? []) as SubscriptionRow[]) {
        if (!row.organisation_id || !row.provider_customer_id) continue;
        customerByTenant.set(row.organisation_id, row.provider_customer_id);
      }

      const jobsByTenant = new Map<string, VoiceJobRow[]>();
      for (const job of candidates) {
        const key = String(job.organisation_id);
        const arr = jobsByTenant.get(key) ?? [];
        arr.push(job);
        jobsByTenant.set(key, arr);
      }

      let tenantsBilled = 0;
      let jobsBilled = 0;
      let amountInr = 0;
      const skippedTenants: string[] = [];

      for (const [tenantId, tenantJobs] of jobsByTenant.entries()) {
        const jobIds = tenantJobs.map((job) => job.id);
        const tenantAmount = Number(
          tenantJobs
            .reduce((sum, job) => sum + Math.max(0, toNumber(job.charge_inr)), 0)
            .toFixed(2),
        );

        if (tenantAmount > 0) {
          const customerId = customerByTenant.get(tenantId);
          if (!customerId) {
            skippedTenants.push(tenantId);
            continue;
          }

          const invoice = await createRazorpayInvoice({
            customerId,
            amountInr: tenantAmount,
            lineItemName: "Voice screening",
            description: `Voice screening — ${monthLabel}: ${tenantJobs.length} completed calls`,
            metadata: {
              tenant_id: tenantId,
              month: monthLabel,
              call_count: String(tenantJobs.length),
            },
          });

          logger.info("Created screening monthly invoice", {
            tenant_id: tenantId,
            month: monthLabel,
            invoice_id: invoice.invoiceId,
            amount_inr: tenantAmount,
            call_count: tenantJobs.length,
          });
        }

        const { error: markError } = await admin
          .from("screening_jobs")
          .update({
            billed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .in("id", jobIds);
        if (markError) throw markError;

        tenantsBilled += 1;
        jobsBilled += jobIds.length;
        amountInr += tenantAmount;
      }

      await completeSyncLog(syncLogId, {
        ended_at: new Date().toISOString(),
        jobs_fetched: candidates.length,
        jobs_inserted: jobsBilled,
        jobs_updated: tenantsBilled,
        jobs_dropped: skippedTenants.length,
        error:
          skippedTenants.length > 0
            ? `Missing Razorpay customer for tenants: ${skippedTenants.join(",")}`
            : null,
      });

      return jsonSuccess({
        ok: true,
        window: { startIso, endIso, monthLabel },
        tenantsBilled,
        jobsBilled,
        amountInr: Number(amountInr.toFixed(2)),
        skippedTenants,
      });
    } catch (err) {
      await completeSyncLog(syncLogId, {
        ended_at: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      });
      return handleApiError(err, "Screening monthly billing failed", {
        route: "GET /api/billing/screening-monthly",
      });
    }
  }),
);

export const GET = handler;
export const POST = handler;
