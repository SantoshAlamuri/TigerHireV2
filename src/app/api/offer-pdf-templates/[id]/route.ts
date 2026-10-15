import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  jsonError,
  jsonSuccess,
  handleApiError,
  parseJsonBody,
  handleZodError,
} from "@/lib/api-helpers";
import { hasAnyEnterpriseRole } from "@/lib/security/enterprise-roles";
import { validateOrigin } from "@/lib/security/csrf";
import { z } from "zod";
import { getLatestTemplateVersion } from "@/lib/offers/offer-pdf-template";
import {
  isMissingOfferTemplateCustomMergeColumn,
  offerCustomMergeFieldDefSchema,
  parseCustomMergeFieldDefs,
  RESERVED_OFFER_TEMPLATE_VAR_KEYS,
} from "@/lib/offers/offer-custom-merge-fields";
import {
  isMissingOfferTemplateSelectionRulesColumn,
  parseOfferTemplateSelectionRules,
} from "@/lib/offers/offer-template-selection-rules";

const patchSchema = z
  .object({
    bodyText: z.string().min(20).max(50_000).optional(),
    setDefault: z.boolean().optional(),
    customMergeFieldDefs: z.array(offerCustomMergeFieldDefSchema).max(40).optional(),
    selectionRules: z
      .object({
        roleTitleContains: z.array(z.string().min(1).max(120)).max(20).optional(),
        locations: z.array(z.string().min(1).max(120)).max(20).optional(),
        employmentTypes: z.array(z.string().min(1).max(120)).max(20).optional(),
        seniorityLevels: z.array(z.string().min(1).max(120)).max(20).optional(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    const hasPayload =
      data.bodyText !== undefined ||
      data.customMergeFieldDefs !== undefined ||
      data.selectionRules !== undefined ||
      data.setDefault === true;
    if (!hasPayload) {
      ctx.addIssue({
        code: "custom",
        message: "Provide bodyText, customMergeFieldDefs, selectionRules, and/or setDefault",
      });
    }
    if (data.customMergeFieldDefs) {
      const keys = data.customMergeFieldDefs.map((r) => r.key);
      if (new Set(keys).size !== keys.length) {
        ctx.addIssue({
          code: "custom",
          message: "Duplicate custom field keys",
          path: ["customMergeFieldDefs"],
        });
      }
      for (const row of data.customMergeFieldDefs) {
        if (RESERVED_OFFER_TEMPLATE_VAR_KEYS.has(row.key)) {
          ctx.addIssue({
            code: "custom",
            message: `Key "${row.key}" is reserved for built-in merge fields`,
            path: ["customMergeFieldDefs"],
          });
          break;
        }
      }
    }
  });

/**
 * GET /api/offer-pdf-templates/[id]
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);

    const supabase = await createSupabaseServerClient();
    const allowed = await hasAnyEnterpriseRole(
      ctx.userId,
      ["leadership", "recruiter", "hiring_manager", "finance", "super_admin"],
      supabase,
    );
    if (!allowed) return jsonError("Forbidden", 403);

    let { data: t, error } = await supabase
      .from("offer_pdf_templates")
      .select("id, name, is_default, organisation_id, custom_merge_field_defs, selection_rules")
      .eq("id", id)
      .single();

    if (
      error &&
      (isMissingOfferTemplateCustomMergeColumn(error) ||
        isMissingOfferTemplateSelectionRulesColumn(error))
    ) {
      ({ data: t, error } = await supabase
        .from("offer_pdf_templates")
        .select("id, name, is_default, organisation_id")
        .eq("id", id)
        .single());
    }

    if (error || !t || t.organisation_id !== ctx.organisationId) {
      return jsonError("Template not found", 404);
    }

    const admin = createSupabaseAdmin();
    const latest = await getLatestTemplateVersion(admin, id);

    return jsonSuccess({
      template: {
        id: t.id,
        name: t.name,
        is_default: t.is_default,
        latestVersionNumber: latest?.versionNumber ?? 0,
        bodyText: latest?.bodyText ?? "",
        customMergeFieldDefs: parseCustomMergeFieldDefs(
          (t as { custom_merge_field_defs?: unknown }).custom_merge_field_defs,
        ),
        selectionRules: parseOfferTemplateSelectionRules(
          (t as { selection_rules?: unknown }).selection_rules,
        ),
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to load template", {
      route: "GET /api/offer-pdf-templates/[id]",
    });
  }
}

/**
 * PATCH /api/offer-pdf-templates/[id] — append a new body version; optional set as org default.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const { id } = await params;
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);

    const supabase = await createSupabaseServerClient();
    const allowed = await hasAnyEnterpriseRole(
      ctx.userId,
      ["leadership", "recruiter", "hiring_manager", "super_admin"],
      supabase,
    );
    if (!allowed) return jsonError("Forbidden", 403);

    const { body, errorResponse } = await parseJsonBody(
      request,
      "PATCH /api/offer-pdf-templates/[id]",
    );
    if (errorResponse) return errorResponse;
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const { data: t, error: findErr } = await supabase
      .from("offer_pdf_templates")
      .select("id, organisation_id")
      .eq("id", id)
      .single();

    if (findErr || !t || t.organisation_id !== ctx.organisationId) {
      return jsonError("Template not found", 404);
    }

    const admin = createSupabaseAdmin();
    const current = await getLatestTemplateVersion(admin, id);
    let versionNumber = current?.versionNumber ?? 0;

    if (parsed.data.bodyText !== undefined) {
      versionNumber = (current?.versionNumber ?? 0) + 1;
      const { error: vErr } = await supabase.from("offer_pdf_template_versions").insert({
        template_id: id,
        version_number: versionNumber,
        body_text: parsed.data.bodyText,
        created_by: ctx.userId,
      });
      if (vErr) return jsonError(vErr.message, 500);
    }

    if (parsed.data.customMergeFieldDefs !== undefined) {
      const normalized = parseCustomMergeFieldDefs(parsed.data.customMergeFieldDefs);
      const { error: defErr } = await supabase
        .from("offer_pdf_templates")
        .update({ custom_merge_field_defs: normalized })
        .eq("id", id)
        .eq("organisation_id", ctx.organisationId);
      if (defErr && isMissingOfferTemplateCustomMergeColumn(defErr)) {
        return jsonError(
          "Custom merge fields need the latest database migration. Apply Supabase migrations so column offer_pdf_templates.custom_merge_field_defs exists, then retry.",
          503,
        );
      }
      if (defErr) return jsonError(defErr.message, 500);
    }

    if (parsed.data.selectionRules !== undefined) {
      const normalized = parseOfferTemplateSelectionRules(parsed.data.selectionRules);
      const { error: rulesErr } = await supabase
        .from("offer_pdf_templates")
        .update({ selection_rules: normalized })
        .eq("id", id)
        .eq("organisation_id", ctx.organisationId);
      if (rulesErr && isMissingOfferTemplateSelectionRulesColumn(rulesErr)) {
        return jsonError(
          "Template assignment rules need the latest database migration. Apply Supabase migrations so column offer_pdf_templates.selection_rules exists, then retry.",
          503,
        );
      }
      if (rulesErr) return jsonError(rulesErr.message, 500);
    }

    if (parsed.data.setDefault === true) {
      await supabase
        .from("offer_pdf_templates")
        .update({ is_default: false })
        .eq("organisation_id", ctx.organisationId)
        .eq("is_archived", false);

      const { error: uErr } = await supabase
        .from("offer_pdf_templates")
        .update({ is_default: true })
        .eq("id", id)
        .eq("organisation_id", ctx.organisationId);

      if (uErr) return jsonError(uErr.message, 500);
    }

    return jsonSuccess({ templateId: id, versionNumber });
  } catch (err) {
    return handleApiError(err, "Failed to update template", {
      route: "PATCH /api/offer-pdf-templates/[id]",
    });
  }
}
