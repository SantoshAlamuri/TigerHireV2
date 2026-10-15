-- Candidate-owned career drafts are separate from recruiter-visible candidate rows.
create table public.candidate_career_profiles (
  candidate_id uuid primary key references public.candidates(id) on delete cascade,
  document jsonb not null default '{}'::jsonb
    check (jsonb_typeof(document) = 'object' and octet_length(document::text) <= 300000),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.candidate_career_profiles enable row level security;
revoke all on public.candidate_career_profiles from public, anon, authenticated;
grant select, delete on public.candidate_career_profiles to authenticated;
grant insert (candidate_id, document), update (document) on public.candidate_career_profiles to authenticated;
grant all on public.candidate_career_profiles to service_role;

create policy candidate_owns_career_profile on public.candidate_career_profiles
  for all to authenticated
  using (exists (
    select 1 from public.candidates c
    where c.id = candidate_id and c.user_id = (select auth.uid()) and c.erased_at is null
  ))
  with check (exists (
    select 1 from public.candidates c
    where c.id = candidate_id and c.user_id = (select auth.uid()) and c.erased_at is null
  ));

create function public.touch_candidate_career_profile()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.touch_candidate_career_profile() from public, anon, authenticated;

create trigger touch_candidate_career_profile
  before update on public.candidate_career_profiles
  for each row execute function public.touch_candidate_career_profile();
