alter table public.assessments
  add column if not exists share_token text;

create unique index if not exists idx_assessments_share_token
  on public.assessments(share_token)
  where share_token is not null;
