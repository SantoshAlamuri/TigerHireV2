-- Security advisor hardening:
-- 1) Use SECURITY INVOKER for exposed analytics/observability views.
-- 2) Set explicit search_path for mutable function.
-- 3) Revoke anon execute on sensitive SECURITY DEFINER RPCs.

ALTER VIEW public.analytics_recent_activity
  SET (security_invoker = true);

ALTER VIEW public.candidate_acknowledgement_attempts_daily
  SET (security_invoker = true);

ALTER FUNCTION public.check_circular_vouch_depth_3(text, text)
  SET search_path = public, pg_catalog;

REVOKE EXECUTE ON FUNCTION public.th_book_interview_slot(uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.webhook_event_try_acquire(text, text) FROM anon;
