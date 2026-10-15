-- Messages is dead for every signed-in user: GET /api/messages 500s because the
-- SELECT policy on conversation_participants queries conversation_participants,
-- so Postgres raises 42P17 "infinite recursion detected in policy for relation".
--
--   conversation_participants_select USING (
--     user_id = auth.uid()
--     OR EXISTS (SELECT 1 FROM conversation_participants cp2 WHERE ...)  <-- recurses
--   )
--
-- conversations_select / conversations_update recurse for the same reason: they
-- read conversation_participants, which re-enters the broken policy above.
--
-- Fix: answer "is this user in that conversation?" in one SECURITY DEFINER
-- function that bypasses RLS, and have all three policies call it. The access
-- rule is unchanged — a user sees a conversation, and its participant rows, only
-- when they are themselves a participant.

create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
-- Pinned search_path: SECURITY DEFINER without it is resolvable against a
-- caller-controlled schema.
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.conversation_participants
    where conversation_id = p_conversation_id
      and user_id = (select auth.uid())
  );
$$;

comment on function public.is_conversation_participant(uuid) is
  'Participant check used by conversation RLS policies. SECURITY DEFINER so the policy does not re-enter conversation_participants and recurse (42P17).';

-- The function reads membership for the *calling* user only (auth.uid() is
-- evaluated inside), so it cannot be used to enumerate other people''s
-- conversations. anon has no business calling it.
revoke execute on function public.is_conversation_participant(uuid) from public;
revoke execute on function public.is_conversation_participant(uuid) from anon;
grant execute on function public.is_conversation_participant(uuid) to authenticated;

drop policy if exists conversation_participants_select on public.conversation_participants;
create policy conversation_participants_select
  on public.conversation_participants
  for select
  using (
    user_id = (select auth.uid())
    or public.is_conversation_participant(conversation_id)
  );

drop policy if exists conversations_select on public.conversations;
create policy conversations_select
  on public.conversations
  for select
  using (public.is_conversation_participant(id));

drop policy if exists conversations_update on public.conversations;
create policy conversations_update
  on public.conversations
  for update
  using (public.is_conversation_participant(id));
