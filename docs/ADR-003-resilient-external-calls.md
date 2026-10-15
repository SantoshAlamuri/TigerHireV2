# ADR 003: Resilient External Service Calls

## Status

Accepted.

## Context

TigerHire integrates with multiple external services that are critical to the platform's functionality:

- **Stripe**: Payment processing for subscriptions and billing
- **Resend**: Email delivery for notifications and invites
- **Apify**: Web scraping for candidate and job signals
- **Anthropic**: AI-powered candidate enrichment and FitScore computation
- **OpenAI**: Embedding generation for semantic search

These services are subject to network failures, rate limits, timeouts, and temporary outages. Without proper error handling, a single service failure could cascade and degrade the user experience or cause data inconsistencies.

## Decision

Created a unified `resilient-call.ts` utility that combines three reliability patterns:

1. **Circuit Breaker**: Prevents cascading failures by opening the circuit after a threshold of failures, allowing services to recover
2. **Retry with Exponential Backoff**: Automatically retries transient failures with increasing delays
3. **Timeout**: Enforces maximum execution time to prevent hanging requests

The pattern is implemented as a factory function `createResilientCall()` that returns a wrapped function. Each service creates its own resilient caller with service-specific configuration:

```typescript
const stripeCall = createResilientCall({
  service: "stripe",
  failureThreshold: 5,
  openMs: 30_000,
  timeoutMs: 30_000,
  maxRetries: 2,
});
```

All external service calls are wrapped using this pattern, ensuring consistent error handling and resilience across the platform.

## Consequences

### Positive

- **Consistent Error Handling**: All external services follow the same reliability pattern
- **Improved Resilience**: Circuit breakers prevent cascading failures; retries handle transient issues
- **Better Observability**: Service failures are logged with context (service name, error message, labels)
- **Configurable Per Service**: Each service can tune thresholds, timeouts, and retry counts based on its characteristics
- **Graceful Degradation**: When a circuit is open, requests fail fast rather than hanging

### Negative

- **Additional Complexity**: Developers must wrap external calls (though the pattern is simple)
- **Potential Latency**: Retries add latency to failed requests (but prevent complete failures)
- **Memory Overhead**: Circuit breaker state is maintained in memory (minimal impact)

### Implementation Notes

- Circuit breaker state is per-service and stored in memory (resets on server restart)
- Default timeout is 30 seconds; can be overridden per service
- Default retry count is 2; exponential backoff is handled by the `withRetry` utility
- All failures are logged with structured logging for debugging and alerting

## References

- Implementation: `src/lib/utils/resilient-call.ts`
- Circuit breaker: `src/lib/utils/circuit-breaker.ts`
- Retry logic: `src/lib/utils/retry.ts`
- Service usage:
  - `src/lib/services/stripe.ts`
  - `src/lib/services/resend.ts`
  - `src/lib/services/apify.ts`
  - `src/lib/services/anthropic.ts`
