// Barrel re-export for the role-guided WhatsApp flow. The implementation lives in
// sibling modules under ./role-guided-flow/ to keep each file focused and within
// the repo file-size lint gate. The public export surface is unchanged.
export { asRoleOptions, asJobOptions } from "./role-guided-flow/parsers";
export { startRoleGuidedFlow } from "./role-guided-flow/start-flow";
export { handleRoleFamilySelectionReply } from "./role-guided-flow/family-selection";
export { handleRoleJobSelectionReply } from "./role-guided-flow/job-selection";
export { scoreAndPresentSelectedRole } from "./role-guided-flow/scoring";
export { routeRolePickReply } from "./role-guided-flow/routing";
