-- Fix: allow org admins to insert audit log entries.

drop policy if exists "org admins can write audit log" on public.audit_log;
create policy "org admins can write audit log"
  on public.audit_log for insert
  with check (
    (
      organisation_id = public.auth_organisation_id()
      and public.auth_role() in ('company_admin', 'super_admin')
    )
    or public.auth_role() = 'super_admin'
  );
