import dotenv from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function chunk<T>(input: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let idx = 0; idx < input.length; idx += size) {
    out.push(input.slice(idx, idx + size));
  }
  return out;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: sessions, error: sessionErr } = await supabase
    .from("whatsapp_sessions")
    .select("phone, context")
    .not("context", "is", null);

  if (sessionErr) {
    throw new Error(`Failed to read whatsapp_sessions: ${sessionErr.message}`);
  }

  const mapping = new Map<string, string>();
  let rowsWithReferralContext = 0;
  for (const row of sessions ?? []) {
    const context = (row.context ?? {}) as Record<string, unknown>;
    const referralId = typeof context.referral_id === "string" ? context.referral_id.trim() : "";
    const candidateId = typeof context.candidate_id === "string" ? context.candidate_id.trim() : "";
    if (!referralId || !candidateId) continue;
    rowsWithReferralContext += 1;
    if (!mapping.has(referralId)) {
      mapping.set(referralId, candidateId);
    }
  }

  const referralIds = [...mapping.keys()];
  if (referralIds.length === 0) {
    console.log("No referral->candidate pairs found in whatsapp_sessions context.");
    return;
  }

  const idBatches = chunk(referralIds, 200);
  let referralsScanned = 0;
  let linked = 0;
  let alreadyLinked = 0;
  let conflict = 0;
  let missing = 0;
  let statusOnlyUpdates = 0;
  const pendingStatusUpdates: string[] = [];
  const conflictRows: Array<{
    referral_id: string;
    session_candidate_id: string;
    referral_candidate_id: string;
    referral_status: string;
  }> = [];

  for (const ids of idBatches) {
    const { data: referrals, error: refErr } = await supabase
      .from("referrals")
      .select("id, candidate_id, status")
      .in("id", ids);
    if (refErr) throw new Error(`Failed to read referrals batch: ${refErr.message}`);

    const byId = new Map((referrals ?? []).map((r) => [String(r.id), r]));
    referralsScanned += ids.length;

    for (const referralId of ids) {
      const referral = byId.get(referralId);
      const candidateId = mapping.get(referralId) as string;
      if (!referral) {
        missing += 1;
        continue;
      }

      const existingCandidateId = (referral.candidate_id as string | null) ?? null;
      const currentStatus = String(referral.status ?? "");

      if (existingCandidateId && existingCandidateId !== candidateId) {
        conflict += 1;
        if (conflictRows.length < 500) {
          conflictRows.push({
            referral_id: referralId,
            session_candidate_id: candidateId,
            referral_candidate_id: existingCandidateId,
            referral_status: currentStatus,
          });
        }
        continue;
      }

      if (existingCandidateId === candidateId) {
        alreadyLinked += 1;
        if (currentStatus === "pending") {
          pendingStatusUpdates.push(referralId);
        }
        continue;
      }

      if (dryRun) {
        linked += 1;
        continue;
      }

      const nextStatus = currentStatus === "pending" ? "cv_received" : currentStatus;
      const { error: updateErr } = await supabase
        .from("referrals")
        .update({ candidate_id: candidateId, status: nextStatus || "cv_received" })
        .eq("id", referralId)
        .is("candidate_id", null);
      if (updateErr) {
        throw new Error(`Failed to update referral ${referralId}: ${updateErr.message}`);
      }
      linked += 1;
    }
  }

  if (!dryRun && pendingStatusUpdates.length > 0) {
    for (const ids of chunk(pendingStatusUpdates, 200)) {
      const { error: statusErr } = await supabase
        .from("referrals")
        .update({ status: "cv_received" })
        .in("id", ids)
        .eq("status", "pending");
      if (statusErr) throw new Error(`Failed to bump pending statuses: ${statusErr.message}`);
      statusOnlyUpdates += ids.length;
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        sessions_scanned: sessions?.length ?? 0,
        rows_with_referral_context: rowsWithReferralContext,
        unique_referral_pairs: referralIds.length,
        referrals_scanned: referralsScanned,
        linked,
        already_linked: alreadyLinked,
        status_only_updates: statusOnlyUpdates,
        conflict,
        missing,
        conflict_sample_size: conflictRows.length,
        conflict_sample: conflictRows.slice(0, 100),
      },
      null,
      2,
    ),
  );

  if (dryRun && conflictRows.length > 0) {
    console.log("\nDry-run conflict sample (referrals linked to different candidates):");
    for (const row of conflictRows.slice(0, 25)) {
      console.log(
        `${row.referral_id}: referral=${row.referral_candidate_id} session=${row.session_candidate_id} status=${row.referral_status}`,
      );
    }
    console.log(
      "Review full conflict_sample JSON before real run; investigate any high-volume mismatch.",
    );
  }
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
