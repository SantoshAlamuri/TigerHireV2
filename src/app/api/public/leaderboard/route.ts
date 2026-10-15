import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

/** Align with Cache-Control max-age=300 for optional CDN/ISR hints. */
export const revalidate = 300;

/** Mask: first whitespace-delimited token of full name. */
function referrerFirstName(full: string | null | undefined): string {
  const t = full?.trim();
  if (!t) return "Someone";
  const first = t.split(/\s+/)[0];
  return first || "Someone";
}

export type PublicLeaderboardItem = {
  referrer_id: string;
  referrer_first_name: string;
  referrer_city: string;
  amount: number;
  currency: string;
  job_title: string;
  placements_total: number;
  amount_total: number;
};

export type PublicLeaderboardStats = {
  referrer_count: number;
  total_inr: number;
};

function leaderboardStatsFromPaidSample(
  rows: { referrer_id: string; amount: unknown }[] | null | undefined,
): PublicLeaderboardStats {
  const list = rows ?? [];
  const referrers = new Set<string>();
  let total = 0;
  for (const r of list) {
    if (r.referrer_id) referrers.add(r.referrer_id as string);
    const amt = Number(r.amount ?? 0);
    if (Number.isFinite(amt)) total += amt;
  }
  return { referrer_count: referrers.size, total_inr: total };
}

/**
 * GET /api/public/leaderboard — recent paid payouts for marketing ticker (no auth).
 * Cache-Control: 5 minutes. Aggregates are per-referrer across all paid rows.
 *
 * Join path: payout_ledger → referrers (name, city), candidates (via candidate_id), jobs (via applications).
 * If `referrers.city` is missing (pre-migration), retry select without `city` and return "".
 */
export async function GET() {
  const headers = {
    "Cache-Control": "public, max-age=300",
  };

  try {
    const admin = createSupabaseAdmin();

    const [{ data: payouts, error: payErr }, { data: paidSample }] = await Promise.all([
      admin
        .from("payout_ledger")
        .select("id, amount, currency, created_at, candidate_id, referrer_id")
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(20),
      admin.from("payout_ledger").select("referrer_id, amount").eq("status", "paid").limit(5000),
    ]);

    const stats = leaderboardStatsFromPaidSample(paidSample);

    if (payErr) {
      logger.warn("GET /api/public/leaderboard: payout query failed", { message: payErr.message });
      return NextResponse.json(
        { items: [] as PublicLeaderboardItem[], stats },
        { status: 200, headers },
      );
    }

    const rows = payouts ?? [];
    if (rows.length === 0) {
      return NextResponse.json(
        { items: [] as PublicLeaderboardItem[], stats },
        { status: 200, headers },
      );
    }

    const referrerIds = [...new Set(rows.map((r) => r.referrer_id as string))];
    const candidateIds = [...new Set(rows.map((r) => r.candidate_id as string))];

    const [referrersRes, aggRes, appsRes] = await Promise.all([
      admin.from("referrers").select("id, name, city").in("id", referrerIds),
      admin
        .from("payout_ledger")
        .select("referrer_id, amount")
        .eq("status", "paid")
        .in("referrer_id", referrerIds),
      admin
        .from("applications")
        .select("candidate_id, job_id, direct_referrer_id, updated_at")
        .in("candidate_id", candidateIds),
    ]);

    type RefRow = { id: string; name: string | null; city?: string | null };
    let referrerRows: RefRow[] = (referrersRes.data ?? []) as RefRow[];
    if (referrersRes.error) {
      const retry = await admin.from("referrers").select("id, name").in("id", referrerIds);
      if (retry.error) {
        logger.warn("GET /api/public/leaderboard: referrers failed", {
          message: referrersRes.error.message,
        });
        return NextResponse.json(
          { items: [] as PublicLeaderboardItem[], stats },
          { status: 200, headers },
        );
      }
      referrerRows = (retry.data ?? []) as RefRow[];
    }

    const refById = new Map(
      referrerRows.map((r) => [
        r.id,
        {
          name: r.name,
          city: typeof r.city === "string" ? r.city : "",
        },
      ]),
    );

    const aggByRef = new Map<string, { count: number; sum: number }>();
    if (!aggRes.error) {
      for (const row of aggRes.data ?? []) {
        const rid = row.referrer_id as string;
        const amt = Number(row.amount ?? 0);
        const cur = aggByRef.get(rid) ?? { count: 0, sum: 0 };
        cur.count += 1;
        cur.sum += Number.isFinite(amt) ? amt : 0;
        aggByRef.set(rid, cur);
      }
    }

    const apps = (appsRes.error ? [] : (appsRes.data ?? [])) as {
      candidate_id: string;
      job_id: string;
      direct_referrer_id: string | null;
      updated_at: string | null;
    }[];

    function jobIdForPayout(candidateId: string, referrerId: string): string | null {
      const forCand = apps.filter((a) => a.candidate_id === candidateId);
      if (forCand.length === 0) return null;
      const preferred = forCand.filter((a) => a.direct_referrer_id === referrerId);
      const pool = preferred.length > 0 ? preferred : forCand;
      const sorted = [...pool].sort((a, b) => {
        const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return tb - ta;
      });
      return sorted[0]?.job_id ?? null;
    }

    const jobIds = new Set<string>();
    for (const p of rows) {
      const jid = jobIdForPayout(p.candidate_id as string, p.referrer_id as string);
      if (jid) jobIds.add(jid);
    }

    const { data: jobsData } =
      jobIds.size > 0
        ? await admin
            .from("jobs")
            .select("id, title")
            .in("id", [...jobIds])
        : { data: [] as { id: string; title: string }[] };

    const titleByJobId = new Map(
      (jobsData ?? []).map((j) => [j.id as string, (j.title as string) || "Role"]),
    );

    const items: PublicLeaderboardItem[] = rows.map((p) => {
      const refId = p.referrer_id as string;
      const candId = p.candidate_id as string;
      const refRow = refById.get(refId);
      const rowAmt = Number(p.amount ?? 0);
      const agg = aggByRef.get(refId) ?? { count: 1, sum: Number.isFinite(rowAmt) ? rowAmt : 0 };
      const jid = jobIdForPayout(candId, refId);
      const jobTitle = jid ? (titleByJobId.get(jid) ?? "open role") : "open role";
      const cityRaw = refRow?.city?.trim() ?? "";

      return {
        referrer_id: refId,
        referrer_first_name: referrerFirstName(refRow?.name),
        referrer_city: cityRaw,
        amount: Number(p.amount ?? 0),
        currency: (p.currency as string) || "INR",
        job_title: jobTitle,
        placements_total: agg.count,
        amount_total: agg.sum,
      };
    });

    return NextResponse.json({ items, stats }, { status: 200, headers });
  } catch (e) {
    logger.warn("GET /api/public/leaderboard: unexpected", {
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      {
        items: [] as PublicLeaderboardItem[],
        stats: { referrer_count: 0, total_inr: 0 } satisfies PublicLeaderboardStats,
      },
      { status: 200, headers },
    );
  }
}
