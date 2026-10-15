alter table public.assessments
  drop constraint if exists assessments_type_check;

alter table public.assessments
  add constraint assessments_type_check
  check (type in ('written', 'take_home', 'mcq', 'coding', 'psychometric'));
