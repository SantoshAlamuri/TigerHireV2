-- Create the recalculate_all_trust_scores() function referenced by pg_cron.
-- This is the DB-level counterpart to the Vercel /api/cron/trust route.
-- It recalculates trust for candidates with recent vouch or verification activity.

CREATE OR REPLACE FUNCTION recalculate_all_trust_scores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
           c.human_signal,
           c.human_signal_confidence
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

    IF rec.human_signal = 'likely_ai_generated' AND coalesce(rec.human_signal_confidence, 0) > 0.8 THEN
      v_score := v_score - 10;
    END IF;

    v_score := LEAST(100, GREATEST(0, v_score));

    UPDATE candidates SET trust_score = v_score WHERE id = rec.id;
  END LOOP;
END;
$$;
