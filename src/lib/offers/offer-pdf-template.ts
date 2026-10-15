import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_OFFER_TEMPLATE_BODY } from "@/lib/offers/default-offer-template-body";
import {
  interpolateOfferTemplate,
  type OfferTemplateVariables,
} from "@/lib/offers/interpolate-offer-template";
import {
  parseOfferCtcValue,
  resolveCompensationBreakdownForTemplate,
} from "@/lib/offers/compensation-normalize";
import {
  isMissingOfferTemplateCustomMergeColumn,
  parseCustomMergeFieldDefs,
  resolvedCustomMergeValues,
  type OfferCustomMergeFieldDef,
} from "@/lib/offers/offer-custom-merge-fields";
import { formatCtcLpaInr } from "@/lib/offers/offer-ctc-calculator";
import { buildOfferLetterPdfFromText } from "@/lib/offers/build-offer-pdf";
import { offerTemplateBodyToPdfPlainText } from "@/lib/offers/offer-template-html-to-plain";

export type ResolvedOfferPdfTemplate = {
  templateId: string;
  /** Row in `offer_pdf_template_versions` used for this render / send (B2). */
  templateVersionId: string;
  versionNumber: number;
  bodyText: string;
  customMergeFieldDefs: OfferCustomMergeFieldDef[];
};

/**
 * Ensure the org has a default offer PDF template + v1 body (idempotent).
 */
export async function ensureDefaultOfferPdfTemplate(
  admin: SupabaseClient,
  organisationId: string,
  createdBy: string | null,
): Promise<string> {
  const { data: existing } = await admin
    .from("offer_pdf_templates")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("is_default", true)
    .eq("is_archived", false)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: inserted, error: insErr } = await admin
    .from("offer_pdf_templates")
    .insert({
      organisation_id: organisationId,
      name: "Default offer letter",
      is_default: true,
      is_archived: false,
      created_by: createdBy,
    })
    .select("id")
    .single();

  if (insErr) {
    const { data: race } = await admin
      .from("offer_pdf_templates")
      .select("id")
      .eq("organisation_id", organisationId)
      .eq("is_default", true)
      .eq("is_archived", false)
      .maybeSingle();
    if (race?.id) return race.id as string;
    throw new Error(insErr.message);
  }

  if (!inserted?.id) {
    throw new Error("Failed to create default offer PDF template");
  }

  const tid = inserted.id as string;
  const { error: vErr } = await admin.from("offer_pdf_template_versions").insert({
    template_id: tid,
    version_number: 1,
    body_text: DEFAULT_OFFER_TEMPLATE_BODY,
    created_by: createdBy,
  });
  if (vErr) {
    throw new Error(vErr.message);
  }
  return tid;
}

export async function getLatestTemplateVersion(
  admin: SupabaseClient,
  templateId: string,
): Promise<{ id: string; versionNumber: number; bodyText: string } | null> {
  const { data, error } = await admin
    .from("offer_pdf_template_versions")
    .select("id, version_number, body_text")
    .eq("template_id", templateId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id as string,
    versionNumber: data.version_number as number,
    bodyText: data.body_text as string,
  };
}

/**
 * Resolve template body for generating the PDF at send time (admin client).
 */
export async function resolveOfferPdfTemplateForSend(
  admin: SupabaseClient,
  organisationId: string,
  offerPdfTemplateId: string | null | undefined,
  createdByFallback: string | null,
): Promise<ResolvedOfferPdfTemplate> {
  let templateId: string | null = offerPdfTemplateId ?? null;

  if (templateId) {
    const { data: t } = await admin
      .from("offer_pdf_templates")
      .select("id, organisation_id")
      .eq("id", templateId)
      .maybeSingle();
    if (!t || (t.organisation_id as string) !== organisationId) {
      templateId = null;
    }
  }

  if (!templateId) {
    templateId = await ensureDefaultOfferPdfTemplate(admin, organisationId, createdByFallback);
  }

  const { data: tplMeta, error: tplMetaErr } = await admin
    .from("offer_pdf_templates")
    .select("custom_merge_field_defs")
    .eq("id", templateId)
    .maybeSingle();
  let customMergeFieldDefs: OfferCustomMergeFieldDef[] = [];
  if (tplMetaErr) {
    if (!isMissingOfferTemplateCustomMergeColumn(tplMetaErr)) {
      throw new Error(tplMetaErr.message);
    }
  } else {
    customMergeFieldDefs = parseCustomMergeFieldDefs(
      (tplMeta as { custom_merge_field_defs?: unknown } | null)?.custom_merge_field_defs,
    );
  }

  const latest = await getLatestTemplateVersion(admin, templateId);
  if (!latest) {
    const { data: insertedV, error: fixErr } = await admin
      .from("offer_pdf_template_versions")
      .insert({
        template_id: templateId,
        version_number: 1,
        body_text: DEFAULT_OFFER_TEMPLATE_BODY,
        created_by: createdByFallback,
      })
      .select("id")
      .single();
    if (fixErr || !insertedV?.id) {
      throw new Error(fixErr?.message ?? "Failed to insert default template version");
    }
    return {
      templateId,
      templateVersionId: insertedV.id as string,
      versionNumber: 1,
      bodyText: DEFAULT_OFFER_TEMPLATE_BODY,
      customMergeFieldDefs,
    };
  }

  return {
    templateId,
    templateVersionId: latest.id,
    versionNumber: latest.versionNumber,
    bodyText: latest.bodyText,
    customMergeFieldDefs,
  };
}

export function buildOfferTemplateVariables(params: {
  companyName: string;
  candidateName: string;
  roleTitle: string;
  startDate: string;
  compensation: Record<string, unknown>;
  notes: string | null;
}): OfferTemplateVariables {
  const comp = JSON.stringify(params.compensation, null, 2);
  const ctcNum = parseOfferCtcValue(params.compensation?.ctc as unknown);
  const ctc_lpa =
    ctcNum !== null && Number.isFinite(ctcNum) && ctcNum > 0 ? formatCtcLpaInr(ctcNum) : "";
  const compensation_breakdown = resolveCompensationBreakdownForTemplate(params.compensation);
  return {
    company_name: params.companyName || "Your organisation",
    candidate_name: params.candidateName || "Candidate",
    role_title: params.roleTitle,
    start_date: params.startDate,
    compensation: comp,
    compensation_breakdown,
    ctc_lpa,
    notes: params.notes?.trim() ? params.notes.trim() : "(none)",
    generated_date: new Date().toISOString().slice(0, 10),
  };
}

export async function buildOfferPdfFromResolvedTemplate(
  resolved: ResolvedOfferPdfTemplate,
  vars: OfferTemplateVariables,
  letterVariables?: unknown,
): Promise<{ base64: string; contentHash: string }> {
  const custom = resolvedCustomMergeValues(resolved.customMergeFieldDefs, letterVariables ?? {});
  const rendered = interpolateOfferTemplate(resolved.bodyText, vars, custom);
  const plain = offerTemplateBodyToPdfPlainText(rendered);
  return buildOfferLetterPdfFromText(plain);
}
