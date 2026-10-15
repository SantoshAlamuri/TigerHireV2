import { NextRequest } from "next/server";
import { handleApiError, jsonSuccess } from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSettingsAdmin } from "@/lib/settings/server";
import { listConnections } from "@/lib/repositories/integration-connections.repository";
import { normalizeIntegrationConnection } from "@/lib/integrations/connection-lifecycle";

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

/**
 * GET /api/compliance/scorecard
 * Lightweight enterprise compliance scorecard for organisation admins.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSettingsAdmin(request, { capability: "view_settings" });
    if (auth.error) return auth.error;

    const organisationId = auth.context.organisationId;
    const supabase = await createSupabaseServerClient();

    const [privacyRes, orgRes, auditRes, profilesRes, integrations] = await Promise.all([
      supabase
        .from("privacy_settings")
        .select("recording_retention_days, transcript_retention_days")
        .eq("organisation_id", organisationId)
        .maybeSingle(),
      supabase.from("organisations").select("enforce_sso").eq("id", organisationId).maybeSingle(),
      supabase
        .from("hiring_offer_audit_events")
        .select("id", { count: "exact", head: true })
        .eq("organisation_id", organisationId)
        .gte("created_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()),
      supabase.from("profiles").select("id").eq("organisation_id", organisationId),
      listConnections(supabase, { scope: "organisation", organisationId }),
    ]);

    const profileIds = (profilesRes.data ?? []).map((p) => p.id as string);
    let piiEventCount30d = 0;
    if (profileIds.length > 0) {
      const { count } = await supabase
        .from("access_audit_log")
        .select("id", { count: "exact", head: true })
        .in("user_id", profileIds)
        .gte("created_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString());
      piiEventCount30d = count ?? 0;
    }

    const normalizedConnections = integrations.map(normalizeIntegrationConnection);
    const connectedCount = normalizedConnections.filter((row) => row.status === "connected").length;
    const monitoredCount = normalizedConnections.filter(
      (row) => row.lifecycle.health === "healthy" || row.lifecycle.health === "degraded",
    ).length;

    const hasPrivacySettings = Boolean(privacyRes.data);
    const hasSsoEnforcement = Boolean(orgRes.data?.enforce_sso);
    const hasAuditCoverage = (auditRes.count ?? 0) > 0;
    const hasPiiAuditCoverage = piiEventCount30d > 0;

    const controlChecks = [
      { key: "privacy_settings", ok: hasPrivacySettings, weight: 1 },
      { key: "sso_enforcement", ok: hasSsoEnforcement, weight: 1 },
      { key: "audit_events", ok: hasAuditCoverage, weight: 1 },
      { key: "pii_access_audit", ok: hasPiiAuditCoverage, weight: 1 },
      { key: "integration_connected", ok: connectedCount > 0, weight: 1 },
      { key: "integration_monitored", ok: monitoredCount > 0, weight: 1 },
    ];
    const passed = controlChecks.filter((item) => item.ok).length;
    const total = controlChecks.length;

    return jsonSuccess({
      organisationId,
      generatedAt: new Date().toISOString(),
      scorecard: {
        readinessScore: ratio(passed, total),
        passedControls: passed,
        totalControls: total,
        checks: controlChecks,
      },
      controls: {
        privacySettings: privacyRes.data ?? null,
        ssoEnforced: hasSsoEnforcement,
        auditEventsLast30Days: auditRes.count ?? 0,
        piiAccessEventsLast30Days: piiEventCount30d,
      },
      integrations: {
        total: normalizedConnections.length,
        connected: connectedCount,
        monitored: monitoredCount,
        byCategory: normalizedConnections.reduce<Record<string, number>>((acc, row) => {
          acc[row.category] = (acc[row.category] ?? 0) + 1;
          return acc;
        }, {}),
      },
      enterpriseExtensions: {
        eeoOfccpReadiness: {
          status: "not_implemented",
          nextStep: "Implement self-identification and disposition reporting model.",
        },
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to generate compliance scorecard", {
      route: "GET /api/compliance/scorecard",
    });
  }
}
