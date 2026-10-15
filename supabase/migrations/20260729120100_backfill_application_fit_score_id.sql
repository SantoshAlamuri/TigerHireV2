-- Reconnect applications to the scores that already exist for them.
--
-- applications.fit_score_id is NULL on every row while fit_scores holds
-- hundreds of records keyed by the same candidate and job. Any code path that
-- reads applications -> fit_scores through this foreign key therefore gets
-- nothing: the candidate profile, the stage lists, score bands in reporting.
-- The v2 review queue is the exception only because it fetches scores
-- separately, which is why the gap stayed invisible.
--
-- v2 has been changed to look scores up by candidate and job rather than depend
-- on this column, so this backfill is not what unblocks v2 — it is what fixes
-- every OTHER consumer, including v1, without each having to work around a
-- foreign key nothing populates.
--
-- REVIEW NOTES
--   * Read-modify-write on existing rows. Run on preview (Sydney) first and
--     confirm the counts below before it goes anywhere near production.
--   * Only fills rows that are currently NULL. An application that already
--     points at a score is left exactly as it is.
--   * Where a candidate was scored more than once for the same job — rescoring
--     after a JD edit is normal — the most recent score wins, matching what the
--     application screens now display.

-- Before: how many applications are missing the link, and how many of those
-- have a score waiting for them.
do $$
declare
  missing_count integer;
  fixable_count integer;
begin
  select count(*) into missing_count
    from public.applications
   where fit_score_id is null;

  select count(*) into fixable_count
    from public.applications a
   where a.fit_score_id is null
     and exists (
       select 1 from public.fit_scores f
        where f.candidate_id = a.candidate_id
          and f.job_id = a.job_id
     );

  raise notice 'applications with no fit_score_id: %', missing_count;
  raise notice 'of those, scores exist for: %', fixable_count;
end $$;

update public.applications a
   set fit_score_id = latest.id
  from (
    select distinct on (candidate_id, job_id)
           id, candidate_id, job_id
      from public.fit_scores
     where candidate_id is not null
       and job_id is not null
     order by candidate_id, job_id, created_at desc
  ) latest
 where a.fit_score_id is null
   and a.candidate_id = latest.candidate_id
   and a.job_id = latest.job_id;

-- After: anything still NULL is an application that genuinely was never
-- scored, which is a different problem and must not be papered over here.
do $$
declare
  still_missing integer;
begin
  select count(*) into still_missing
    from public.applications
   where fit_score_id is null;
  raise notice 'still unlinked after backfill (never scored): %', still_missing;
end $$;
