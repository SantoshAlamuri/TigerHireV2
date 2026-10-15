alter table public.support_requests
  add column if not exists feedback_rating smallint null,
  add column if not exists feedback_comment text null,
  add column if not exists feedback_submitted_at timestamptz null;

alter table public.support_requests
  drop constraint if exists support_requests_feedback_rating_check;

alter table public.support_requests
  add constraint support_requests_feedback_rating_check
  check (feedback_rating is null or feedback_rating between 1 and 5);
