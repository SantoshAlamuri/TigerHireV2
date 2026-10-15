-- P1-4: Atomic rate-limit function to eliminate the insert-then-count race.
-- Inserts a row and returns the window count in a single transaction.

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

COMMENT ON FUNCTION public.check_rate_limit_atomic IS
  'Atomic rate-limit check: inserts a hit and returns the count within the window in one transaction.';
