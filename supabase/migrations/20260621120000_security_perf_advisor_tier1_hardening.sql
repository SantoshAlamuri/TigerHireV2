-- Tier 1 Supabase advisor hardening (applied to Mumbai prod + Sydney preview
-- via MCP on 2026-06-21). All statements idempotent. Clears:
--   * security_definer_view  (ERROR x12) — enforce security_invoker on reporting views
--   * duplicate_index        (WARN  x1)  — drop redundant duplicate index
--   * unindexed_foreign_keys (INFO  88/86)— add covering index per uncovered FK
--   * materialized_view_in_api (WARN x1) — remove matview from exposed API roles

-- 1) security_definer_view: views run RLS as the querying user, not the owner.
alter view if exists public.analytics_candidates_by_source           set (security_invoker = true);
alter view if exists public.analytics_pipeline_conversion            set (security_invoker = true);
alter view if exists public.analytics_recent_activity                set (security_invoker = true);
alter view if exists public.analytics_time_to_hire                   set (security_invoker = true);
alter view if exists public.application_funnel                       set (security_invoker = true);
alter view if exists public.application_source_summary               set (security_invoker = true);
alter view if exists public.candidate_acknowledgement_attempts_daily set (security_invoker = true);
alter view if exists public.monthly_billing_audit                    set (security_invoker = true);
alter view if exists public.payout_export                            set (security_invoker = true);
alter view if exists public.pipeline_stage_dwell                     set (security_invoker = true);
alter view if exists public.pipeline_stage_dwell_samples             set (security_invoker = true);
alter view if exists public.platform_cost_daily                      set (security_invoker = true);

-- 2) duplicate_index: agent_email_ingestion had two identical indexes.
drop index if exists public.idx_ingestion_job;

-- 3) unindexed_foreign_keys: covering btree index for every public FK whose
--    columns are not already the leading columns of an existing index. DO block
--    recomputes the missing set at apply time, so it is correct on any database
--    and never creates a duplicate.
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass::text as tbl,
           left(c.conname || '_idx', 63) as idxname,
           (select string_agg(quote_ident(a.attname), ', ' order by k.ord)
              from unnest(c.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as cols
    from pg_constraint c
    where c.contype = 'f'
      and c.connamespace = 'public'::regnamespace
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (string_to_array(i.indkey::text, ' ')::int2[])[1:array_length(c.conkey, 1)] = c.conkey
      )
  loop
    execute format('create index if not exists %I on %s (%s);', r.idxname, r.tbl, r.cols);
  end loop;
end $$;

-- 4) materialized_view_in_api: matviews cannot enforce RLS; remove from API roles.
revoke select on public.market_score_pools from anon;
revoke select on public.market_score_pools from authenticated;
