import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

/**
 * Append a failed operation to the DLQ for manual reprocessing.
 * Does not throw; logs if insert fails.
 */
export async function appendToDlq(
  operationType: string,
  payload: Record<string, unknown>,
  errorMessage?: string,
): Promise<void> {
  try {
    const supabase = createSupabaseAdmin();
    const { error } = await supabase.from("failed_operations").insert({
      operation_type: operationType,
      payload,
      error_message: errorMessage ?? null,
    });
    if (error) {
      logger.error("DLQ insert failed", {
        operation_type: operationType,
        error: String(error),
      });
    }
  } catch (e) {
    logger.error("DLQ append error", { error: String(e) });
  }
}
