-- Weekly locks are additive: existing plans and pulses are not rewritten.
alter table public.hundred_day_plan_weekly_pulses
  add column locked_at timestamptz,
  add column plan_snapshot jsonb;

comment on column public.hundred_day_plan_weekly_pulses.locked_at is
  'Server-recorded finalization of the weekly update. NULL means draft or legacy unfinalized update.';
comment on column public.hundred_day_plan_weekly_pulses.plan_snapshot is
  'Server-captured committed plan at weekly finalization; immutable with the locked pulse.';

create function public.guard_weekly_plan_review()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_today date := (now() at time zone 'Asia/Dubai')::date;
  v_week date := date_trunc('week', now() at time zone 'Asia/Dubai')::date;
  v_plan public.hundred_day_plans%rowtype;
begin
  -- Administrative recovery/offboarding retains its existing privileged path.
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if v_user_id is null or not exists (
    select 1 from public.profiles p where p.id = v_user_id and p.is_active is true
  ) then
    raise exception using errcode = '42501', message = 'An active signed-in team member is required.';
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.locked_at is not null then
    raise exception using errcode = '42501', message = 'This weekly update is locked. Start a new update next Monday.';
  end if;

  if tg_op = 'DELETE' then return old; end if;

  if new.user_id is distinct from v_user_id then
    raise exception using errcode = '42501', message = 'You can only save your own weekly update.';
  end if;

  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.plan_id is distinct from old.plan_id
    or new.user_id is distinct from old.user_id
    or new.week_start is distinct from old.week_start
  ) then
    raise exception using errcode = '42501', message = 'A weekly update cannot be reassigned to another plan, person, or week.';
  end if;

  if new.locked_at is null then
    new.plan_snapshot := null;
    return new;
  end if;

  if new.week_start is distinct from v_week then
    raise exception using errcode = '22023', message = 'Only the current Monday review week can be locked (Dubai time).';
  end if;

  select p.* into v_plan from public.hundred_day_plans p
    where p.id = new.plan_id and p.user_id = v_user_id
    for share;
  if not found or v_plan.status <> 'committed' then
    raise exception using errcode = '22023', message = 'Commit your 100-day plan before locking the weekly update.';
  end if;
  if v_plan.start_date is null or v_plan.start_date > v_today
    or (v_plan.end_date is not null and v_plan.end_date < v_today) then
    raise exception using errcode = '22023', message = 'The plan must be within its active dates before a weekly update can be locked.';
  end if;
  if nullif(trim(new.progress_note), '') is null
    or nullif(trim(new.next_commitment), '') is null then
    raise exception using errcode = '22023', message = 'Add progress since last week and your next commitment before locking.';
  end if;

  new.locked_at := now();
  new.submitted_at := now();
  new.plan_snapshot := to_jsonb(v_plan);
  return new;
end;
$$;

revoke all on function public.guard_weekly_plan_review() from public, anon, authenticated;

create trigger guard_weekly_plan_review
before insert or update or delete on public.hundred_day_plan_weekly_pulses
for each row execute function public.guard_weekly_plan_review();

-- Existing owner and management SELECT policies remain unchanged.
