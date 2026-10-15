import type { ScreeningMode } from "./types";
import { shouldSkipAutomatedScreening } from "./compliance";

export function applyDoNotCallModeGuard(args: {
  doNotCall: boolean;
  resolvedMode: ScreeningMode;
}): ScreeningMode {
  if (
    shouldSkipAutomatedScreening({
      doNotCall: args.doNotCall,
      requestedMode: args.resolvedMode,
    })
  ) {
    return "none";
  }
  return args.resolvedMode;
}
