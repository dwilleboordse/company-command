-- Atomically freeze the latest live Client Roster allocation into its ending
-- month and create the next live month. The Client Roster itself is untouched.

create or replace function public.close_design_cs_month(
  p_current_month date,
  p_new_month date,
  p_new_label text,
  p_working_days smallint,
  p_allocations jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_latest_month date;
  v_snapshot_count integer := 0;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required to close a Design and CS month.';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = v_user_id
      and profile.is_active is true
      and (
        profile.role = 'ceo'
        or profile.position in ('ops_manager', 'ops_assistant')
      )
  ) then
    raise exception using
      errcode = '42501',
      message = 'CEO or Operations access is required to close a Design and CS month.';
  end if;

  if p_new_month <> (p_current_month + interval '1 month')::date then
    raise exception using
      errcode = '22023',
      message = 'The new Design and CS month must immediately follow the month being closed.';
  end if;

  if extract(day from p_current_month) <> 1 or extract(day from p_new_month) <> 1 then
    raise exception using
      errcode = '22023',
      message = 'Design and CS months must start on the first day of the month.';
  end if;

  if nullif(trim(p_new_label), '') is null then
    raise exception using
      errcode = '22023',
      message = 'The new Design and CS month requires a label.';
  end if;

  if p_working_days not between 1 and 31 then
    raise exception using
      errcode = '22023',
      message = 'Working days must be between 1 and 31.';
  end if;

  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'The closing allocation snapshot must be a JSON array.';
  end if;

  -- Serialize month rollover attempts so two operators cannot close the same
  -- month at the same time.
  perform pg_advisory_xact_lock(hashtextextended('design_cs_month_rollover', 0));

  select max(month.month_start)
  into v_latest_month
  from public.design_cs_months month;

  if v_latest_month = p_new_month then
    select count(*)
    into v_snapshot_count
    from public.design_cs_allocations allocation
    where allocation.month_start = p_current_month;

    return jsonb_build_object(
      'closed_month', p_current_month,
      'new_month', p_new_month,
      'snapshot_count', v_snapshot_count,
      'already_started', true
    );
  end if;

  if v_latest_month is distinct from p_current_month then
    raise exception using
      errcode = 'P0001',
      message = 'Only the latest Design and CS month can be closed.';
  end if;

  delete from public.design_cs_allocations allocation
  where allocation.month_start = p_current_month;

  insert into public.design_cs_allocations (
    month_start,
    source_key,
    client_id,
    client_name_snapshot,
    strategist_key,
    strategist_keys,
    statics,
    videos,
    designer_keys,
    editor_keys,
    ugc_manager_keys,
    ugc_enabled,
    notes,
    updated_at,
    updated_by
  )
  select
    p_current_month,
    item.source_key,
    item.client_id,
    item.client_name_snapshot,
    item.strategist_key,
    coalesce(item.strategist_keys, '{}'::text[]),
    coalesce(item.statics, 0),
    coalesce(item.videos, 0),
    coalesce(item.designer_keys, '{}'::text[]),
    coalesce(item.editor_keys, '{}'::text[]),
    coalesce(item.ugc_manager_keys, '{}'::text[]),
    coalesce(item.ugc_enabled, false),
    coalesce(item.notes, ''),
    now(),
    v_user_id
  from jsonb_to_recordset(p_allocations) as item (
    source_key text,
    client_id uuid,
    client_name_snapshot text,
    strategist_key text,
    strategist_keys text[],
    statics integer,
    videos integer,
    designer_keys text[],
    editor_keys text[],
    ugc_manager_keys text[],
    ugc_enabled boolean,
    notes text
  );

  get diagnostics v_snapshot_count = row_count;

  update public.design_cs_months
  set
    is_locked = true,
    updated_at = now(),
    updated_by = v_user_id
  where month_start = p_current_month;

  insert into public.design_cs_months (
    month_start,
    label,
    working_days,
    source,
    is_locked,
    updated_by
  ) values (
    p_new_month,
    trim(p_new_label),
    p_working_days,
    'company_command',
    false,
    v_user_id
  );

  return jsonb_build_object(
    'closed_month', p_current_month,
    'new_month', p_new_month,
    'snapshot_count', v_snapshot_count,
    'already_started', false
  );
end;
$$;

revoke all on function public.close_design_cs_month(date, date, text, smallint, jsonb)
  from public, anon, authenticated;
grant execute on function public.close_design_cs_month(date, date, text, smallint, jsonb)
  to authenticated, service_role;

comment on function public.close_design_cs_month(date, date, text, smallint, jsonb) is
  'Freezes the latest live Client Roster allocation into a locked monthly snapshot and creates the next live month in one transaction.';
