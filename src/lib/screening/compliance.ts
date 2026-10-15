export const OPT_OUT_KEYWORD_RE = /^\s*(stop|unsubscribe|do\s*not\s*call|opt\s*out)\s*[!.]?\s*$/i;

export function isOptOutKeyword(value: string): boolean {
  return OPT_OUT_KEYWORD_RE.test(value);
}

export function shouldSkipAutomatedScreening(args: {
  doNotCall: boolean;
  requestedMode: "voice" | "whatsapp" | "manual" | "none";
}): boolean {
  if (!args.doNotCall) return false;
  return args.requestedMode === "voice" || args.requestedMode === "whatsapp";
}
