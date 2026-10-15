alter table public.applications
  add column if not exists current_ctc_lpa numeric,
  add column if not exists expected_ctc_lpa numeric,
  add column if not exists notice_period_days integer,
  add column if not exists offers_in_hand integer default 0,
  add column if not exists available_from date,
  add column if not exists relocation_willingness text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'applications_relocation_willingness_check'
  ) then
    alter table public.applications
      add constraint applications_relocation_willingness_check
      check (
        relocation_willingness is null
        or relocation_willingness in ('yes', 'no', 'negotiable')
      );
  end if;
end $$;
