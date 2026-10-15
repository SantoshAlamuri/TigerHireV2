-- Atomic interview slot booking to guarantee slot + pipeline update consistency.

create or replace function public.th_book_interview_slot(
  p_job_id uuid,
  p_slot_id uuid,
  p_pipeline_candidate_id uuid
)
returns table (
  success boolean,
  start_at timestamptz,
  end_at timestamptz,
  error_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_slot_status text;
  v_existing_booked_slot uuid;
begin
  perform 1
  from public.pipeline_candidates
  where id = p_pipeline_candidate_id
    and job_id = p_job_id;

  if not found then
    return query select false, null::timestamptz, null::timestamptz, 'pipeline_candidate_not_found'::text;
    return;
  end if;

  select id
  into v_existing_booked_slot
  from public.interview_availability_slots
  where job_id = p_job_id
    and pipeline_candidate_id = p_pipeline_candidate_id
    and status = 'booked'
    and id <> p_slot_id
  limit 1;

  if v_existing_booked_slot is not null then
    return query select false, null::timestamptz, null::timestamptz, 'pipeline_candidate_already_booked'::text;
    return;
  end if;

  update public.interview_availability_slots
  set status = 'booked',
      pipeline_candidate_id = p_pipeline_candidate_id
  where id = p_slot_id
    and job_id = p_job_id
    and status = 'available'
  returning interview_availability_slots.start_at, interview_availability_slots.end_at
  into v_start_at, v_end_at;

  if v_start_at is null then
    select status
    into v_slot_status
    from public.interview_availability_slots
    where id = p_slot_id
      and job_id = p_job_id;

    if v_slot_status is null then
      return query select false, null::timestamptz, null::timestamptz, 'slot_not_found'::text;
    else
      return query select false, null::timestamptz, null::timestamptz, 'slot_unavailable'::text;
    end if;
    return;
  end if;

  update public.pipeline_candidates
  set interview_scheduled_at = v_start_at,
      reminder_sent_at = null,
      status = 'in_progress'
  where id = p_pipeline_candidate_id
    and job_id = p_job_id;

  if not found then
    update public.interview_availability_slots
    set status = 'available',
        pipeline_candidate_id = null
    where id = p_slot_id
      and job_id = p_job_id
      and pipeline_candidate_id = p_pipeline_candidate_id;

    return query select false, null::timestamptz, null::timestamptz, 'pipeline_candidate_not_found'::text;
    return;
  end if;

  return query select true, v_start_at, v_end_at, null::text;
end;
$$;

grant execute on function public.th_book_interview_slot(uuid, uuid, uuid) to authenticated, service_role;

