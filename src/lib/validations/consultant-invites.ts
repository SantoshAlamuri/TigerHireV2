import { z } from "zod";

/** Company invites an external consulting firm to work on its roles. */
export const consultantInviteCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email("Valid email required").max(320),
  /** Display name of the firm, shown on the accept page. Optional. */
  agencyName: z.string().trim().max(200).optional(),
  /** Optional note from the inviter, included in the invite email. */
  note: z.string().trim().max(500).optional(),
});

export type ConsultantInviteCreateInput = z.infer<typeof consultantInviteCreateSchema>;

export const CONSULTANT_INVITE_TTL_DAYS = 14;

/** Route param: an invite / link row id. */
export const consultantInviteIdSchema = z.string().uuid("Invalid id");

/**
 * Route param: the invite token. 32 random bytes rendered as hex — pinning the
 * shape keeps malformed tokens from reaching the database at all.
 */
export const consultantInviteTokenSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Invalid invitation token");

/** An invite is usable only while pending and unexpired. */
export function consultantInviteUsability(invite: {
  status: string;
  expires_at: string;
}): { usable: true } | { usable: false; reason: "accepted" | "revoked" | "expired" } {
  if (invite.status === "accepted") return { usable: false, reason: "accepted" };
  if (invite.status === "revoked") return { usable: false, reason: "revoked" };
  if (invite.status === "expired") return { usable: false, reason: "expired" };
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return { usable: false, reason: "expired" };
  }
  return { usable: true };
}

/**
 * A company's decision on a firm's access request.
 *
 * There is no "reject" that hides the row: a declined request is `revoked`, so
 * the company can still see who asked and when.
 */
export const consultantRequestDecisionSchema = z.object({
  decision: z.enum(["approve", "decline"]),
});

export type ConsultantRequestDecision = z.infer<typeof consultantRequestDecisionSchema>;
