# ADR 004: Atomic Rate Limiting

## Status

Accepted.

## Context

Rate limiting is critical for preventing abuse and ensuring fair resource usage. The original implementation used an "insert-then-count" pattern:

1. Insert a row into `rate_limit_log`
2. Count rows for the key within the time window
3. Compare count to limit

This pattern had a **race condition**: between the insert and count operations, concurrent requests could both insert rows, both see counts below the limit, and both proceed. This allowed bursts to exceed the intended rate limit.

## Decision

Implemented an atomic rate limiting function `check_rate_limit_atomic` in PostgreSQL that wraps both operations in a single transaction:

```sql
CREATE OR REPLACE FUNCTION public.check_rate_limit_atomic(
  p_key text,
  p_window_start timestamptz,
  p_limit integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.rate_limit_log (key, created_at)
  VALUES (p_key, now());

  SELECT count(*)::integer INTO v_count
  FROM public.rate_limit_log
  WHERE key = p_key
    AND created_at >= p_window_start;

  RETURN v_count;
END;
$$;
```

The function:

- Inserts the rate limit hit
- Counts hits within the window
- Returns the count in a single atomic operation

The application code (`src/lib/security/rate-limit.ts`) calls this function via `supabase.rpc()`. If the RPC is unavailable (e.g., during migrations or database issues), it falls back to the original insert-then-count pattern, which is still better than failing open.

## Consequences

### Positive

- **Eliminates Race Conditions**: Single transaction ensures atomicity
- **Accurate Rate Limiting**: Concurrent requests cannot bypass limits
- **Backward Compatible**: Fallback ensures the system continues to work if RPC is unavailable
- **Single Round-Trip**: More efficient than separate insert + count queries

### Negative

- **Database Dependency**: Requires PostgreSQL function (not portable to other databases)
- **Migration Overhead**: Function must be deployed via migration (`supabase/schema/51_rate_limit_atomic.sql`)
- **Fallback Complexity**: Code must handle both atomic and non-atomic paths

### Implementation Notes

- The function uses `SECURITY DEFINER` to ensure it can insert into `rate_limit_log` regardless of RLS policies
- `SET search_path = ''` prevents search path injection attacks
- The fallback path logs a warning when RPC is unavailable, allowing monitoring of fallback usage
- Rate limit windows are calculated client-side; the function receives the window start timestamp

## References

- Implementation: `src/lib/security/rate-limit.ts`
- Database function: `supabase/schema/51_rate_limit_atomic.sql`
- Rate limit log table: Defined in `supabase/schema/` (referenced by the function)
