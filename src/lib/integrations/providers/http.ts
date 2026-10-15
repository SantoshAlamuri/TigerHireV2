export interface IntegrationValidationResult {
  ok: boolean;
  status: "connected" | "error";
  message: string;
  metadata?: Record<string, unknown>;
}

export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = 10000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function okResult(
  message: string,
  metadata?: Record<string, unknown>,
): IntegrationValidationResult {
  return { ok: true, status: "connected", message, metadata };
}

export function errorResult(
  message: string,
  metadata?: Record<string, unknown>,
): IntegrationValidationResult {
  return { ok: false, status: "error", message, metadata };
}
