// Public surface preserved: import everything from "@/lib/whatsapp/referral-handler".
// Implementation lives in cohesive sibling modules under ./referral-handler/.
export { reachReferredCandidateOnWhatsApp } from "./referral-handler/reach";
export { resolveOrCreateReferrerIdentityForFlow } from "./referral-handler/referrer-identity";
export { parseReferralText } from "./referral-handler/parse";
export { detectAndHandleReferral } from "./referral-handler/detect";
export { handleReferralCandidatePhone } from "./referral-handler/candidate-phone";
export { findOrCreateReferralForTarget } from "./referral-handler/find-or-create";
