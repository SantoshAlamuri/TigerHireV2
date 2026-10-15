import { buildDescriptionAuto } from "@/lib/jobs/build-description";

const JD_MIN_CHARS = 100;

export type RequisitionReadinessStatus =
  | "approved"
  | "pending"
  | "draft"
  | "on_hold"
  | "rejected"
  | "not_linked";

export type JdReadinessStatus = "published" | "missing";

export type JdBaseReadinessStatus =
  | "approved"
  | "pending_approval"
  | "not_generated"
  | "not_applicable";

export type ScoringReadinessStatus =
  | "all_v2"
  | "needs_rescore"
  | "inactive"
  | "no_candidates"
  | "legacy_path";

export interface JobReadinessResponse {
  hybrid_v2_enabled: boolean;
  requisition: {
    status: RequisitionReadinessStatus;
    req_code: string | null;
    reviewer_name: string | null;
    hiring_request_id: string | null;
    on_hold_reason: string | null;
    raw_status: string | null;
  };
  jd: {
    status: JdReadinessStatus;
    char_count: number;
  };
  jd_base: {
    status: JdBaseReadinessStatus;
    approved_by_name: string | null;
    approved_at: string | null;
    jd_base_id: string | null;
  };
  scoring: {
    hybrid_v2_count: number;
    legacy_count: number;
    total: number;
    pending_scoring_count: number;
    status: ScoringReadinessStatus;
  };
}

export function isJdPublished(
  description: string | null | undefined,
  jdSections: unknown,
): {
  published: boolean;
  char_count: number;
} {
  const desc = (description ?? "").trim();
  const fromSections = buildDescriptionAuto(jdSections).trim();
  const char_count = Math.max(desc.length, fromSections.length);
  const published = desc.length >= JD_MIN_CHARS || fromSections.length >= JD_MIN_CHARS;
  return { published, char_count };
}

export function mapRequisitionStatus(
  hiringRequestId: string | null | undefined,
  rawStatus: string | null | undefined,
): RequisitionReadinessStatus {
  if (!hiringRequestId) return "not_linked";
  const st = String(rawStatus ?? "").toLowerCase();
  if (st === "converted") return "approved";
  if (st === "draft") return "draft";
  if (st === "on_hold") return "on_hold";
  if (st === "rejected" || st === "cancelled") return "rejected";
  if (st === "submitted" || st === "under_review" || st === "approved" || st === "pending") {
    return "pending";
  }
  return "pending";
}

export function deriveScoringStatus(input: {
  hybrid_v2_enabled: boolean;
  jd_base_status: JdBaseReadinessStatus;
  hybrid_v2_count: number;
  legacy_count: number;
  total: number;
}): ScoringReadinessStatus {
  if (!input.hybrid_v2_enabled) return "legacy_path";
  if (input.jd_base_status !== "approved") return "inactive";
  if (input.total === 0) return "no_candidates";
  if (input.legacy_count > 0) return "needs_rescore";
  return "all_v2";
}

export function computeJobReadiness(input: {
  hybrid_v2_enabled: boolean;
  hiring_request_id: string | null;
  req_status: string | null;
  req_code: string | null;
  reviewer_name: string | null;
  on_hold_reason: string | null;
  description: string | null;
  jd_sections: unknown;
  jd_base_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  approver_name: string | null;
  hybrid_v2_count: number;
  legacy_count: number;
  pending_scoring_count: number;
}): JobReadinessResponse {
  const jdCheck = isJdPublished(input.description, input.jd_sections);

  let jd_base_status: JdBaseReadinessStatus;
  if (!input.hybrid_v2_enabled) {
    jd_base_status = "not_applicable";
  } else if (!input.jd_base_id) {
    jd_base_status = "not_generated";
  } else if (!input.approved_by) {
    jd_base_status = "pending_approval";
  } else {
    jd_base_status = "approved";
  }

  const total = input.hybrid_v2_count + input.legacy_count;

  return {
    hybrid_v2_enabled: input.hybrid_v2_enabled,
    requisition: {
      status: mapRequisitionStatus(input.hiring_request_id, input.req_status),
      req_code: input.req_code,
      reviewer_name: input.reviewer_name,
      hiring_request_id: input.hiring_request_id,
      on_hold_reason: input.on_hold_reason,
      raw_status: input.req_status,
    },
    jd: {
      status: jdCheck.published ? "published" : "missing",
      char_count: jdCheck.char_count,
    },
    jd_base: {
      status: jd_base_status,
      approved_by_name: input.approver_name,
      approved_at: input.approved_at,
      jd_base_id: input.jd_base_id,
    },
    scoring: {
      hybrid_v2_count: input.hybrid_v2_count,
      legacy_count: input.legacy_count,
      total,
      pending_scoring_count: input.pending_scoring_count,
      status: deriveScoringStatus({
        hybrid_v2_enabled: input.hybrid_v2_enabled,
        jd_base_status,
        hybrid_v2_count: input.hybrid_v2_count,
        legacy_count: input.legacy_count,
        total,
      }),
    },
  };
}

/** True when all four steps show a positive / complete state (gray requisition excluded). */
export function isFullyReady(readiness: JobReadinessResponse): boolean {
  const reqOk =
    readiness.requisition.status === "approved" || readiness.requisition.status === "not_linked";
  const jdOk = readiness.jd.status === "published";
  const idealOk =
    readiness.jd_base.status === "approved" || readiness.jd_base.status === "not_applicable";
  const scoreOk =
    readiness.scoring.status === "all_v2" ||
    readiness.scoring.status === "no_candidates" ||
    readiness.scoring.status === "legacy_path";
  return reqOk && jdOk && idealOk && scoreOk;
}
