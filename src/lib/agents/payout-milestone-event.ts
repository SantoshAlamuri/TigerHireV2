/**
 * The milestones a referral bonus can be earned on.
 *
 * Its own module so the ledger writer and the milestone orchestrator can share
 * it without importing each other.
 */
export type PayoutMilestoneEvent = "shortlisted" | "offer_accepted" | "day_90";
