-- Hardens mutable function search_path settings and removes permissive
-- agent email ingestion policy flagged by security advisor.
-- Forward-only migration.
-- Manual rollback: restore previous policy/function settings if required.

alter function public.prevent_public_domain_claim()
  set search_path = pg_catalog, public;

alter function public.set_updated_at()
  set search_path = pg_catalog, public;

alter function public.match_candidates(vector, double precision, integer)
  set search_path = pg_catalog, public, extensions;

alter function public.match_candidates(vector, double precision, integer, smallint)
  set search_path = pg_catalog, public, extensions;

alter function public.match_candidates(
  vector,
  double precision,
  integer,
  smallint,
  text,
  numeric,
  numeric
)
  set search_path = pg_catalog, public, extensions;

drop policy if exists agent_email_ingestion_service_all on public.agent_email_ingestion;
