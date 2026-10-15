import type { JDBaseDocument } from "@/lib/fitscore/hybrid/types";
import { resolveIndiaTemplateMetadata, getIndiaJdTemplates } from "@/lib/fitscore/hybrid";
import type { JobData } from "@/lib/fitscore/types";
import { buildJdText } from "@/lib/fitscore/job-text";
import {
  dimensionDescriptionsFromTemplate,
  mergeDimensionDescriptions,
} from "@/lib/tryout/dimension-copy";

export function serializeTryoutJdBase(doc: JDBaseDocument | null, job?: JobData) {
  if (!doc) return null;
  const meta = resolveIndiaTemplateMetadata(doc.extractionAdditions);
  const icp = doc.idealCandidateProfile;
  const template = meta.templateId
    ? getIndiaJdTemplates().find((t) => t.id === meta.templateId)
    : undefined;
  const templateDescriptions = template
    ? dimensionDescriptionsFromTemplate(template, doc.weights)
    : {};
  const dimensionDescriptions = mergeDimensionDescriptions(
    doc.weights,
    templateDescriptions,
    icp?.benchmarks,
  );

  return {
    job_id: doc.jobId,
    jd_base_id: doc.id,
    role_title: doc.roleTitle,
    weights: doc.weights,
    dimension_descriptions: dimensionDescriptions,
    ideal_candidate_profile: icp
      ? {
          summary: icp.summary,
          must_haves: icp.must_haves,
          nice_to_haves: icp.nice_to_haves,
          benchmarks: icp.benchmarks,
          years_range: icp.years_range,
        }
      : null,
    fit_thresholds: doc.fitThresholds,
    score_floor: doc.scoreFloor,
    context: doc.context,
    company: doc.company,
    approved_at: doc.approvedAt ?? null,
    approved_by: doc.approvedBy ?? null,
    source: meta.templateId ? ("template" as const) : ("generated" as const),
    india_template_id: meta.templateId,
    job_title: job?.title ?? doc.roleTitle,
    job_description_text: job ? buildJdText(job) : null,
  };
}

export function inferTitleFromJdText(jdText: string): string {
  const roleLine = jdText.match(/\b(?:role|job title|position|title)\s*[:\-–]\s*([^\n\r]{3,100})/i);
  if (roleLine?.[1]) {
    return roleLine[1]
      .trim()
      .replace(/^#+\s*/, "")
      .slice(0, 120);
  }

  const lines = jdText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const shortLine = lines.find((l) => l.length >= 3 && l.length <= 80);
  if (shortLine) {
    const cleaned = shortLine.replace(/^#+\s*/, "").slice(0, 120);
    if (cleaned.length >= 3) return cleaned;
  }

  const firstLine = lines[0];
  if (!firstLine) return "Tryout Role";
  return firstLine.replace(/^#+\s*/, "").slice(0, 80);
}
