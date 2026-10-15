import type { ScreeningScriptRoleCategory, VoiceScript } from "../../types";
import { backendVoiceScript } from "./backend";
import { dataMlVoiceScript } from "./data_ml";
import { devopsVoiceScript } from "./devops";
import { frontendVoiceScript } from "./frontend";
import { productVoiceScript } from "./product";

export * from "./backend";
export * from "./frontend";
export * from "./data_ml";
export * from "./product";
export * from "./devops";

export const VOICE_SCREENING_SCRIPTS: Record<ScreeningScriptRoleCategory, VoiceScript> = {
  backend: backendVoiceScript,
  frontend: frontendVoiceScript,
  data_ml: dataMlVoiceScript,
  product: productVoiceScript,
  devops: devopsVoiceScript,
};

export function getVoiceScreeningScript(roleCategory: ScreeningScriptRoleCategory): VoiceScript {
  return VOICE_SCREENING_SCRIPTS[roleCategory];
}
