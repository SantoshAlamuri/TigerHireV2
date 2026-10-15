-- Fix phone-normalization regex for depth-3 cycle checks.
-- Postgres regex class '\D' is not reliable here; use explicit non-digit class.

DROP INDEX IF EXISTS public.idx_candidates_phone_digits;

CREATE INDEX IF NOT EXISTS idx_candidates_phone_digits
  ON public.candidates ((regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')))
  WHERE phone IS NOT NULL;

CREATE OR REPLACE FUNCTION public.check_circular_vouch_depth_3(
  p_new_voucher_phone text,
  p_new_candidate_phone text
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  WITH params AS (
    SELECT
      regexp_replace(coalesce(p_new_voucher_phone, ''), '[^0-9]', '', 'g') AS new_voucher_phone,
      regexp_replace(coalesce(p_new_candidate_phone, ''), '[^0-9]', '', 'g') AS new_candidate_phone
  ),
  candidate_a AS MATERIALIZED (
    SELECT c.id
    FROM public.candidates c
    CROSS JOIN params p
    WHERE c.phone IS NOT NULL
      AND regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = p.new_voucher_phone
  )
  SELECT EXISTS (
    SELECT 1
    FROM params p
    JOIN candidate_a a ON true
    JOIN public.vouches v_bc
      ON v_bc.voucher_phone = p.new_candidate_phone
    JOIN public.candidates c_mid
      ON c_mid.id = v_bc.candidate_id
    JOIN public.vouches v_ca
      ON v_ca.candidate_id = a.id
     AND v_ca.voucher_phone = regexp_replace(coalesce(c_mid.phone, ''), '[^0-9]', '', 'g')
    LIMIT 1
  );
$$;
