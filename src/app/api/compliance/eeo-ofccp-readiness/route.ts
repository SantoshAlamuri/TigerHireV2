import { NextRequest } from "next/server";
import { handleApiError, jsonSuccess } from "@/lib/api-helpers";
import { requireSettingsAdmin } from "@/lib/settings/server";

/**
 * GET /api/compliance/eeo-ofccp-readiness
 * Enterprise readiness checklist for EEO/OFCCP program planning.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSettingsAdmin(request, { capability: "view_settings" });
    if (auth.error) return auth.error;

    const checklist = [
      {
        key: "voluntary_self_identification",
        title: "Voluntary self-identification capture",
        status: "not_started",
        required: true,
      },
      {
        key: "disposition_codes",
        title: "Disposition coding across pipeline stages",
        status: "not_started",
        required: true,
      },
      {
        key: "adverse_impact_reporting",
        title: "Adverse impact and representation reporting",
        status: "not_started",
        required: true,
      },
      {
        key: "data_retention_policy_mapping",
        title: "Retention schedule aligned to EEO/OFCCP obligations",
        status: "planned",
        required: true,
      },
      {
        key: "audit_export_bundle",
        title: "Exportable audit bundle for regulatory reviews",
        status: "partial",
        required: true,
      },
    ];

    return jsonSuccess({
      organisationId: auth.context.organisationId,
      generatedAt: new Date().toISOString(),
      // This is a STATIC planning template, not a computed assessment of the
      // org's data. The per-item statuses are the product roadmap position, not
      // a measurement of this tenant. Labelled explicitly so it can't be read as
      // a compliance attestation. (#351)
      kind: "manual_planning_template",
      disclaimer:
        "Static readiness template for planning only — statuses reflect product roadmap position, not a computed assessment of your organisation's data.",
      summary: {
        status: "planning_required",
        computed: false,
        completed: checklist.filter((item) => item.status === "completed").length,
        total: checklist.length,
      },
      checklist,
      recommendedPhases: [
        "Phase 1: schema + consent model for self-identification",
        "Phase 2: pipeline disposition capture and immutable audit events",
        "Phase 3: analytics/reporting exports and compliance dashboards",
      ],
    });
  } catch (err) {
    return handleApiError(err, "Failed to build EEO/OFCCP readiness report", {
      route: "GET /api/compliance/eeo-ofccp-readiness",
    });
  }
}
