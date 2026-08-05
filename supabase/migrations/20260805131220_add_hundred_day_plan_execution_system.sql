-- Compatibility-first 100-day plan execution system.
-- Existing JSON and plan rows remain authoritative; legacy checkpoint keys are retained.

alter table public.hundred_day_plans disable trigger trg_hundred_day_plans_updated_at;

update public.hundred_day_plans
set checkpoints = checkpoints
  || case
       when coalesce(checkpoints ->> 'd30', '') = ''
        and coalesce(checkpoints ->> 'd25', '') <> ''
       then jsonb_build_object('d30', checkpoints -> 'd25')
       else '{}'::jsonb
     end
  || case
       when coalesce(checkpoints ->> 'd60', '') = ''
        and coalesce(checkpoints ->> 'd50', '') <> ''
       then jsonb_build_object('d60', checkpoints -> 'd50')
       else '{}'::jsonb
     end
  || case
       when coalesce(checkpoints ->> 'd90', '') = ''
        and coalesce(checkpoints ->> 'd75', '') <> ''
       then jsonb_build_object('d90', checkpoints -> 'd75')
       else '{}'::jsonb
     end
where (
    coalesce(checkpoints ->> 'd30', '') = ''
    and coalesce(checkpoints ->> 'd25', '') <> ''
  ) or (
    coalesce(checkpoints ->> 'd60', '') = ''
    and coalesce(checkpoints ->> 'd50', '') <> ''
  ) or (
    coalesce(checkpoints ->> 'd90', '') = ''
    and coalesce(checkpoints ->> 'd75', '') <> ''
  );

alter table public.hundred_day_plans enable trigger trg_hundred_day_plans_updated_at;

create table public.hundred_day_plan_weekly_pulses (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.hundred_day_plans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  milestone text not null default '',
  metric_now text not null default '',
  track_status text not null default 'on_track'
    check (track_status in ('on_track', 'at_risk', 'off_track')),
  progress_note text not null default '',
  blocker text not null default '',
  next_commitment text not null default '',
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, week_start)
);

comment on table public.hundred_day_plan_weekly_pulses is
  'Weekly execution pulses for the current legacy-compatible 100-day plan record.';

create index hundred_day_plan_weekly_pulses_user_week_idx
  on public.hundred_day_plan_weekly_pulses (user_id, week_start desc);

create trigger trg_hundred_day_plan_weekly_pulses_updated_at
  before update on public.hundred_day_plan_weekly_pulses
  for each row execute function public.set_updated_at();

create table public.hundred_day_plan_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  manager_id uuid references public.profiles(id) on delete set null,
  source_legacy_plan_id uuid references public.hundred_day_plans(id) on delete set null,
  title text not null default '100-Day Plan',
  cycle_number integer not null default 1 check (cycle_number > 0),
  start_date date not null,
  end_date date not null,
  status text not null default 'draft'
    check (status in ('draft', 'manager_review', 'active', 'at_risk', 'closed', 'cancelled')),
  approved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hundred_day_plan_cycles_dates_valid check (end_date >= start_date),
  unique (user_id, start_date)
);

create index hundred_day_plan_cycles_status_idx
  on public.hundred_day_plan_cycles (status, end_date);

create trigger trg_hundred_day_plan_cycles_updated_at
  before update on public.hundred_day_plan_cycles
  for each row execute function public.set_updated_at();

create table public.hundred_day_plan_goals (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.hundred_day_plan_cycles(id) on delete cascade,
  anchored_objective_id uuid references public.objectives(id) on delete set null,
  sort_order integer not null default 0 check (sort_order >= 0),
  statement text not null,
  why_it_matters text not null default '',
  metric_name text not null default '',
  baseline text not null default '',
  target text not null default '',
  unit text not null default '',
  source_of_truth text not null default '',
  metric_lag text not null default '',
  proof_definition text not null default '',
  status text not null default 'not_started'
    check (status in ('not_started', 'on_track', 'at_risk', 'off_track', 'complete', 'cancelled')),
  actual_value text not null default '',
  outcome_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, sort_order)
);

create trigger trg_hundred_day_plan_goals_updated_at
  before update on public.hundred_day_plan_goals
  for each row execute function public.set_updated_at();

create table public.hundred_day_plan_milestones (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.hundred_day_plan_goals(id) on delete cascade,
  sort_order integer not null default 0 check (sort_order >= 0),
  title text not null,
  gate text not null default '',
  due_date date,
  effort text check (effort is null or effort in ('S', 'M', 'L')),
  depends_on text not null default '',
  dependency_owner_id uuid references public.profiles(id) on delete set null,
  unlocks text not null default '',
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'blocked', 'complete', 'cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (goal_id, sort_order)
);

create trigger trg_hundred_day_plan_milestones_updated_at
  before update on public.hundred_day_plan_milestones
  for each row execute function public.set_updated_at();

create table public.hundred_day_plan_dependencies (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.hundred_day_plan_cycles(id) on delete cascade,
  goal_id uuid references public.hundred_day_plan_goals(id) on delete cascade,
  milestone_id uuid references public.hundred_day_plan_milestones(id) on delete cascade,
  direction text not null default 'waiting_on'
    check (direction in ('waiting_on', 'owed_to')),
  description text not null,
  counterparty text not null default '',
  counterparty_profile_id uuid references public.profiles(id) on delete set null,
  needed_by date,
  follow_up_cadence text not null default '',
  unlocks text not null default '',
  status text not null default 'open' check (status in ('open', 'cleared', 'blocked')),
  cleared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index hundred_day_plan_dependencies_cycle_status_idx
  on public.hundred_day_plan_dependencies (cycle_id, status, needed_by);

create trigger trg_hundred_day_plan_dependencies_updated_at
  before update on public.hundred_day_plan_dependencies
  for each row execute function public.set_updated_at();

create table public.hundred_day_plan_checkpoints (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.hundred_day_plan_cycles(id) on delete cascade,
  checkpoint_day integer not null check (checkpoint_day in (30, 60, 90)),
  checkpoint_date date not null,
  expected_state text not null default '',
  miss_response text not null default '',
  flag_to_profile_id uuid references public.profiles(id) on delete set null,
  flag_to_text text not null default '',
  ask_text text not null default '',
  goal_still_right boolean,
  realignment_notes text not null default '',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, checkpoint_day)
);

create trigger trg_hundred_day_plan_checkpoints_updated_at
  before update on public.hundred_day_plan_checkpoints
  for each row execute function public.set_updated_at();

create table public.hundred_day_plan_cycle_pulses (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.hundred_day_plan_cycles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  milestone text not null default '',
  metric_now text not null default '',
  track_status text not null default 'on_track'
    check (track_status in ('on_track', 'at_risk', 'off_track')),
  progress_note text not null default '',
  blocker text not null default '',
  next_commitment text not null default '',
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, week_start)
);

create index hundred_day_plan_cycle_pulses_user_week_idx
  on public.hundred_day_plan_cycle_pulses (user_id, week_start desc);

create trigger trg_hundred_day_plan_cycle_pulses_updated_at
  before update on public.hundred_day_plan_cycle_pulses
  for each row execute function public.set_updated_at();

alter table public.hundred_day_plan_weekly_pulses enable row level security;
alter table public.hundred_day_plan_cycles enable row level security;
alter table public.hundred_day_plan_goals enable row level security;
alter table public.hundred_day_plan_milestones enable row level security;
alter table public.hundred_day_plan_dependencies enable row level security;
alter table public.hundred_day_plan_checkpoints enable row level security;
alter table public.hundred_day_plan_cycle_pulses enable row level security;

revoke all on table public.hundred_day_plan_weekly_pulses from anon;
revoke all on table public.hundred_day_plan_cycles from anon;
revoke all on table public.hundred_day_plan_goals from anon;
revoke all on table public.hundred_day_plan_milestones from anon;
revoke all on table public.hundred_day_plan_dependencies from anon;
revoke all on table public.hundred_day_plan_checkpoints from anon;
revoke all on table public.hundred_day_plan_cycle_pulses from anon;

grant select, insert, update, delete on table public.hundred_day_plan_weekly_pulses to authenticated;
grant select, insert, update, delete on table public.hundred_day_plan_cycles to authenticated;
grant select, insert, update, delete on table public.hundred_day_plan_goals to authenticated;
grant select, insert, update, delete on table public.hundred_day_plan_milestones to authenticated;
grant select, insert, update, delete on table public.hundred_day_plan_dependencies to authenticated;
grant select, insert, update, delete on table public.hundred_day_plan_checkpoints to authenticated;
grant select, insert, update, delete on table public.hundred_day_plan_cycle_pulses to authenticated;

grant all on table public.hundred_day_plan_weekly_pulses to service_role;
grant all on table public.hundred_day_plan_cycles to service_role;
grant all on table public.hundred_day_plan_goals to service_role;
grant all on table public.hundred_day_plan_milestones to service_role;
grant all on table public.hundred_day_plan_dependencies to service_role;
grant all on table public.hundred_day_plan_checkpoints to service_role;
grant all on table public.hundred_day_plan_cycle_pulses to service_role;

create policy "Users manage own weekly pulses"
  on public.hundred_day_plan_weekly_pulses for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.hundred_day_plans plan
      where plan.id = plan_id and plan.user_id = (select auth.uid())
    )
  );

create policy "Mgmt Ops read weekly pulses"
  on public.hundred_day_plan_weekly_pulses for select to authenticated
  using (
    exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid())
        and (profile.role in ('ceo', 'management') or profile.position in ('ops_manager', 'ops_assistant'))
    )
  );

create policy "Users manage own cycles"
  on public.hundred_day_plan_cycles for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Mgmt Ops read cycles"
  on public.hundred_day_plan_cycles for select to authenticated
  using (
    exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid())
        and (profile.role in ('ceo', 'management') or profile.position in ('ops_manager', 'ops_assistant'))
    )
  );

create policy "Users manage own goals"
  on public.hundred_day_plan_goals for all to authenticated
  using (exists (select 1 from public.hundred_day_plan_cycles cycle where cycle.id = cycle_id and cycle.user_id = (select auth.uid())))
  with check (exists (select 1 from public.hundred_day_plan_cycles cycle where cycle.id = cycle_id and cycle.user_id = (select auth.uid())));

create policy "Mgmt Ops read goals"
  on public.hundred_day_plan_goals for select to authenticated
  using (exists (select 1 from public.profiles profile where profile.id = (select auth.uid()) and (profile.role in ('ceo', 'management') or profile.position in ('ops_manager', 'ops_assistant'))));

create policy "Users manage own milestones"
  on public.hundred_day_plan_milestones for all to authenticated
  using (exists (select 1 from public.hundred_day_plan_goals goal join public.hundred_day_plan_cycles cycle on cycle.id = goal.cycle_id where goal.id = goal_id and cycle.user_id = (select auth.uid())))
  with check (exists (select 1 from public.hundred_day_plan_goals goal join public.hundred_day_plan_cycles cycle on cycle.id = goal.cycle_id where goal.id = goal_id and cycle.user_id = (select auth.uid())));

create policy "Mgmt Ops read milestones"
  on public.hundred_day_plan_milestones for select to authenticated
  using (exists (select 1 from public.profiles profile where profile.id = (select auth.uid()) and (profile.role in ('ceo', 'management') or profile.position in ('ops_manager', 'ops_assistant'))));

create policy "Users manage own dependencies"
  on public.hundred_day_plan_dependencies for all to authenticated
  using (exists (select 1 from public.hundred_day_plan_cycles cycle where cycle.id = cycle_id and cycle.user_id = (select auth.uid())))
  with check (exists (select 1 from public.hundred_day_plan_cycles cycle where cycle.id = cycle_id and cycle.user_id = (select auth.uid())));

create policy "Mgmt Ops read dependencies"
  on public.hundred_day_plan_dependencies for select to authenticated
  using (exists (select 1 from public.profiles profile where profile.id = (select auth.uid()) and (profile.role in ('ceo', 'management') or profile.position in ('ops_manager', 'ops_assistant'))));

create policy "Users manage own checkpoints"
  on public.hundred_day_plan_checkpoints for all to authenticated
  using (exists (select 1 from public.hundred_day_plan_cycles cycle where cycle.id = cycle_id and cycle.user_id = (select auth.uid())))
  with check (exists (select 1 from public.hundred_day_plan_cycles cycle where cycle.id = cycle_id and cycle.user_id = (select auth.uid())));

create policy "Mgmt Ops read checkpoints"
  on public.hundred_day_plan_checkpoints for select to authenticated
  using (exists (select 1 from public.profiles profile where profile.id = (select auth.uid()) and (profile.role in ('ceo', 'management') or profile.position in ('ops_manager', 'ops_assistant'))));

create policy "Users manage own cycle pulses"
  on public.hundred_day_plan_cycle_pulses for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.hundred_day_plan_cycles cycle
      where cycle.id = cycle_id and cycle.user_id = (select auth.uid())
    )
  );

create policy "Mgmt Ops read cycle pulses"
  on public.hundred_day_plan_cycle_pulses for select to authenticated
  using (exists (select 1 from public.profiles profile where profile.id = (select auth.uid()) and (profile.role in ('ceo', 'management') or profile.position in ('ops_manager', 'ops_assistant'))));
