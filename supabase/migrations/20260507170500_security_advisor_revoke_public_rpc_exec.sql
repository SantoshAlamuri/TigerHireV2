-- Prevent anonymous access via inherited PUBLIC execute grants.
REVOKE EXECUTE ON FUNCTION public.th_book_interview_slot(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.webhook_event_try_acquire(text, text) FROM PUBLIC;
