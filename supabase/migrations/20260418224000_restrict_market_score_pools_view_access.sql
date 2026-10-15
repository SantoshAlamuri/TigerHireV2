-- Restrict materialized view access from Data APIs.
-- Forward-only migration.
-- Manual rollback: grant select back to anon/authenticated if explicitly required.

revoke all on table public.market_score_pools from anon, authenticated;
grant select on table public.market_score_pools to service_role, postgres;
