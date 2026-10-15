import { NextRequest } from "next/server";
import { CORRELATION_HEADER, runWithCorrelationId, generateCorrelationId } from "./correlation";

export function withCorrelation(
  handler: (request: NextRequest, ...args: unknown[]) => Promise<Response>,
) {
  return async (request: NextRequest, ...args: unknown[]): Promise<Response> => {
    const correlationId = request.headers.get(CORRELATION_HEADER) ?? generateCorrelationId();
    return runWithCorrelationId(correlationId, () => handler(request, ...args));
  };
}
