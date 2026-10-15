-- Day 90: give the milestone a date it can honestly be counted from.
--
-- `day_90` has been a selectable bonus trigger since March and has never paid
-- anyone. payout-trigger maps application status changes to two events, so
-- 'day_90' matched nothing and the ledger row was never written.
--
-- The fix is not to wire it to the nearest available timestamp. Two candidates
-- were already in the schema and both are wrong:
--
--   pipeline_candidates.hired_at   — when the recruiter marked the hire. Set by
--     a trigger the first time status becomes 'hired', which routinely happens
--     weeks before the person starts, and sometimes for someone who never does.
--   hiring_requests.target_joining_date — a *planning* field on the requisition,
--     entered before a candidate existed. It is a hope, not a fact, and it is
--     per-requisition, not per-hire.
--
-- Ninety days of retention has to be counted from the day the person actually
-- started. That date is not currently recorded anywhere, so this adds it.
--
-- Deliberately nullable, and deliberately not defaulted from hired_at. An unset
-- joining date means the payout is not yet due — never that it is due today.
-- Defaulting would reintroduce exactly the silent-wrong-date bug this replaces,
-- and paying a retention bonus for someone who has not completed the retention
-- is the failure mode that costs real money.

ALTER TABLE pipeline_candidates
  ADD COLUMN IF NOT EXISTS joined_at date;

COMMENT ON COLUMN pipeline_candidates.joined_at IS
  'Actual first day of employment, recorded by the recruiter. Anchor for day-90 referral payouts. NOT hired_at (when the hire was marked) and NOT hiring_requests.target_joining_date (a plan). Null means the day-90 bonus is not yet due.';

-- The sweep reads: joined_at is not null AND joined_at <= today - 90.
CREATE INDEX IF NOT EXISTS idx_pipeline_candidates_joined_at
  ON pipeline_candidates (joined_at)
  WHERE joined_at IS NOT NULL;
