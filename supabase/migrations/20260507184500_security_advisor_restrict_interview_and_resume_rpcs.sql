-- Restrict interview slot mutation and resume default RPCs to service_role.
-- App routes now invoke these via server-side admin clients after explicit access checks.

REVOKE EXECUTE ON FUNCTION public.switch_default_resume(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.switch_default_resume(uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.th_book_interview_slot(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.th_book_interview_slot(uuid, uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.th_cancel_interview_slot(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.th_cancel_interview_slot(uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.th_reschedule_interview_slot(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.th_reschedule_interview_slot(uuid, uuid, uuid) TO service_role;
