-- Convert reporting/export views from SECURITY DEFINER to SECURITY INVOKER semantics.
-- Forward-only migration.
-- Manual rollback: ALTER VIEW ... SET (security_invoker = false) for each view below.

alter view if exists public.application_funnel set (security_invoker = true);
alter view if exists public.application_source_summary set (security_invoker = true);
alter view if exists public.payout_export set (security_invoker = true);
alter view if exists public.pipeline_stage_dwell_samples set (security_invoker = true);
alter view if exists public.pipeline_stage_dwell set (security_invoker = true);
