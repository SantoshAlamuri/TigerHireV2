import type { ScreeningScriptRoleCategory, WhatsAppScript } from "../../types";
import { backendWhatsAppScript } from "./backend";
import { dataMlWhatsAppScript } from "./data_ml";
import { devopsWhatsAppScript } from "./devops";
import { frontendWhatsAppScript } from "./frontend";
import { productWhatsAppScript } from "./product";

export * from "./backend";
export * from "./frontend";
export * from "./data_ml";
export * from "./product";
export * from "./devops";

export const WHATSAPP_SCREENING_SCRIPTS: Record<ScreeningScriptRoleCategory, WhatsAppScript> = {
  backend: backendWhatsAppScript,
  frontend: frontendWhatsAppScript,
  data_ml: dataMlWhatsAppScript,
  product: productWhatsAppScript,
  devops: devopsWhatsAppScript,
};

export function getWhatsAppScreeningScript(
  roleCategory: ScreeningScriptRoleCategory,
): WhatsAppScript {
  return WHATSAPP_SCREENING_SCRIPTS[roleCategory];
}
