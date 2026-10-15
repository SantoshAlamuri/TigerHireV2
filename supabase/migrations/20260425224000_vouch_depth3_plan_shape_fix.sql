-- Ensure depth-3 cycle check uses phone lookup expression index path.
-- Materialize candidate_a lookup and join v_ca by (candidate_id, voucher_phone).

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
