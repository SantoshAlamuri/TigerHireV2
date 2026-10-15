-- Rename Fraud Detector + human_signal persistence to Ghostbuster + authenticity naming.
-- NOTE: Existing migrations are intentionally untouched; this migration performs in-place renames.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'candidates'
      AND column_name = 'fraud_score'
  ) THEN
    EXECUTE 'ALTER TABLE public.candidates RENAME COLUMN fraud_score TO authenticity_score';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'candidates'
      AND column_name = 'fraud_flags'
  ) THEN
    EXECUTE 'ALTER TABLE public.candidates RENAME COLUMN fraud_flags TO authenticity_flags';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'candidates'
      AND column_name = 'human_signal'
  ) THEN
    EXECUTE 'ALTER TABLE public.candidates RENAME COLUMN human_signal TO authenticity_signal';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'candidates'
      AND column_name = 'human_signal_confidence'
  ) THEN
    EXECUTE 'ALTER TABLE public.candidates RENAME COLUMN human_signal_confidence TO authenticity_confidence';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'candidates'
      AND column_name = 'human_signal_reasons'
  ) THEN
    EXECUTE 'ALTER TABLE public.candidates RENAME COLUMN human_signal_reasons TO authenticity_reasons';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i'
      AND n.nspname = 'public'
      AND c.relname = 'idx_candidates_human_signal'
  ) THEN
    EXECUTE 'ALTER INDEX public.idx_candidates_human_signal RENAME TO idx_candidates_authenticity_signal';
  END IF;
END $$;

COMMENT ON COLUMN public.candidates.authenticity_score IS
  'AI-authorship risk score 0-100 from the Ghostbuster authenticity agent';
COMMENT ON COLUMN public.candidates.authenticity_flags IS
  'Array of authenticity flags with type, severity, and evidence';
COMMENT ON COLUMN public.candidates.authenticity_signal IS
  'AI-authorship likelihood signal for recruiter-facing authenticity check';
COMMENT ON COLUMN public.candidates.authenticity_confidence IS
  'Confidence score 0-1 for the authenticity signal';
COMMENT ON COLUMN public.candidates.authenticity_reasons IS
  'Array of reasons explaining the authenticity signal';

UPDATE public.feature_flags
SET
  key = 'ghostbuster_authenticity_agent',
  description = 'Ghostbuster authenticity checks (AI-authorship and prompt manipulation signals)',
  updated_at = now()
WHERE key = 'fraud_agent';

UPDATE public.organisation_runtime_feature_flag_overrides
SET flag_key = 'ghostbuster_authenticity_agent'
WHERE flag_key = 'fraud_agent';

CREATE OR REPLACE FUNCTION public.recalculate_all_trust_scores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  rec RECORD;
  v_score smallint;
  v_vouch_count int;
  v_senior_vouch boolean;
  v_confirmed int;
  v_flagged int;
BEGIN
  FOR rec IN
    SELECT DISTINCT c.id,
           c.entry_path,
           c.linkedin_url,
           c.github_url,
           c.email,
           c.ghost_risk_score,
           c.authenticity_signal,
           c.authenticity_confidence
    FROM candidates c
    WHERE c.id IN (
      SELECT candidate_id FROM vouches WHERE created_at > now() - interval '1 day'
      UNION
      SELECT candidate_id FROM verification_claims WHERE created_at > now() - interval '1 day'
    )
  LOOP
    IF rec.entry_path = 'referral' THEN
      v_score := 40;
    ELSE
      v_score := 20;
    END IF;

    SELECT count(*) INTO v_vouch_count FROM vouches WHERE candidate_id = rec.id;
    IF v_vouch_count >= 1 THEN v_score := v_score + 15; END IF;
    IF v_vouch_count >= 2 THEN v_score := v_score + 10; END IF;

    SELECT exists(SELECT 1 FROM vouches WHERE candidate_id = rec.id AND weight >= 80) INTO v_senior_vouch;
    IF v_senior_vouch THEN v_score := v_score + 10; END IF;

    SELECT count(*) INTO v_confirmed FROM verification_claims WHERE candidate_id = rec.id AND status = 'confirmed';
    SELECT count(*) INTO v_flagged FROM verification_claims WHERE candidate_id = rec.id AND status = 'flagged';
    v_score := v_score + (v_confirmed * 5) - (v_flagged * 10);

    IF rec.linkedin_url IS NOT NULL AND rec.linkedin_url <> '' THEN v_score := v_score + 3; END IF;
    IF rec.github_url IS NOT NULL AND rec.github_url <> '' THEN v_score := v_score + 2; END IF;
    IF rec.email IS NOT NULL AND rec.email <> '' THEN v_score := v_score + 5; END IF;

    IF coalesce(rec.ghost_risk_score, 50) >= 75 THEN v_score := v_score + 5; END IF;

    IF rec.authenticity_signal = 'likely_ai_generated' AND coalesce(rec.authenticity_confidence, 0) > 0.8 THEN
      v_score := v_score - 10;
    END IF;

    v_score := LEAST(100, GREATEST(0, v_score));

    UPDATE candidates SET trust_score = v_score WHERE id = rec.id;
  END LOOP;
END;
$function$;
