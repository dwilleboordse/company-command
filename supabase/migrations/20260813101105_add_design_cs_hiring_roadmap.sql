-- DDU Media workforce planning
-- Adds a normalized, permissioned home for the legacy Design/CS allocation data
-- and a CEO-only hiring roadmap. Existing profiles and clients are referenced,
-- never replaced or deleted.

create table if not exists public.design_cs_months (
  month_start date primary key,
  label text not null,
  working_days smallint not null default 22 check (working_days between 1 and 31),
  source text not null default 'company_command',
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint design_cs_months_first_day check (extract(day from month_start) = 1)
);

create table if not exists public.design_cs_people (
  source_key text primary key,
  profile_id uuid references public.profiles(id) on delete set null,
  display_name text not null,
  discipline text not null check (discipline in ('creative_strategist', 'designer', 'editor', 'ugc_manager')),
  daily_capacity numeric(8,2) check (daily_capacity is null or daily_capacity > 0),
  max_clients smallint check (max_clients is null or max_clients > 0),
  is_active boolean not null default true,
  source text not null default 'company_command',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists design_cs_people_profile_discipline_uidx
  on public.design_cs_people (profile_id, discipline)
  where profile_id is not null;

create table if not exists public.design_cs_allocations (
  id uuid primary key default gen_random_uuid(),
  month_start date not null references public.design_cs_months(month_start) on delete cascade,
  source_key text not null,
  client_id uuid references public.clients(id) on delete set null,
  client_name_snapshot text not null,
  strategist_key text references public.design_cs_people(source_key) on delete set null,
  statics integer not null default 0 check (statics >= 0),
  videos integer not null default 0 check (videos >= 0),
  designer_keys text[] not null default '{}',
  editor_keys text[] not null default '{}',
  ugc_manager_keys text[] not null default '{}',
  ugc_enabled boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  unique (month_start, source_key)
);

create index if not exists design_cs_allocations_client_idx
  on public.design_cs_allocations (client_id);
create index if not exists design_cs_allocations_strategist_idx
  on public.design_cs_allocations (month_start, strategist_key);
create index if not exists design_cs_allocations_editor_keys_idx
  on public.design_cs_allocations using gin (editor_keys);
create index if not exists design_cs_allocations_ugc_keys_idx
  on public.design_cs_allocations using gin (ugc_manager_keys);

create table if not exists public.design_cs_capacity_settings (
  id smallint primary key default 1 check (id = 1),
  cs_min_clients smallint not null default 4 check (cs_min_clients >= 0),
  cs_max_clients smallint not null default 6 check (cs_max_clients >= cs_min_clients),
  cs_min_concepts integer not null default 80 check (cs_min_concepts >= 0),
  cs_max_concepts integer not null default 100 check (cs_max_concepts >= cs_min_concepts),
  editor_daily_capacity numeric(8,2) not null default 5 check (editor_daily_capacity > 0),
  designer_daily_capacity numeric(8,2) not null default 8 check (designer_daily_capacity > 0),
  ugc_max_clients smallint not null default 8 check (ugc_max_clients > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.design_cs_capacity_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.design_cs_import_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  source_version integer,
  source_current_month text,
  payload jsonb not null,
  imported_at timestamptz not null default now(),
  imported_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.hiring_roadmap_items (
  id uuid primary key default gen_random_uuid(),
  role_key text not null,
  role_label text not null,
  department text not null default 'Delivery',
  planned_headcount smallint not null default 1 check (planned_headcount > 0),
  status text not null default 'considering'
    check (status in ('considering', 'approved', 'sourcing', 'interviewing', 'offer', 'hired', 'on_hold')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  target_date date,
  rationale text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create index if not exists hiring_roadmap_items_status_target_idx
  on public.hiring_roadmap_items (status, target_date);

alter table public.design_cs_months enable row level security;
alter table public.design_cs_people enable row level security;
alter table public.design_cs_allocations enable row level security;
alter table public.design_cs_capacity_settings enable row level security;
alter table public.design_cs_import_snapshots enable row level security;
alter table public.hiring_roadmap_items enable row level security;

revoke all on table public.design_cs_months from anon;
revoke all on table public.design_cs_people from anon;
revoke all on table public.design_cs_allocations from anon;
revoke all on table public.design_cs_capacity_settings from anon;
revoke all on table public.design_cs_import_snapshots from anon;
revoke all on table public.hiring_roadmap_items from anon;

grant select, insert, update, delete on table public.design_cs_months to authenticated;
grant select, insert, update, delete on table public.design_cs_people to authenticated;
grant select, insert, update, delete on table public.design_cs_allocations to authenticated;
grant select, insert, update, delete on table public.design_cs_capacity_settings to authenticated;
grant select, insert on table public.design_cs_import_snapshots to authenticated;
grant select, insert, update, delete on table public.hiring_roadmap_items to authenticated;

grant all on table public.design_cs_months to service_role;
grant all on table public.design_cs_people to service_role;
grant all on table public.design_cs_allocations to service_role;
grant all on table public.design_cs_capacity_settings to service_role;
grant all on table public.design_cs_import_snapshots to service_role;
grant all on table public.hiring_roadmap_items to service_role;

-- Design/CS is deliberately narrower than generic management access: CEO and
-- the two Operations positions can view and maintain it.
create policy "CEO and Ops can manage Design CS months"
  on public.design_cs_months for all to authenticated
  using (exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.is_active is true
      and (profile.role = 'ceo' or profile.position in ('ops_manager', 'ops_assistant'))
  ))
  with check (exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.is_active is true
      and (profile.role = 'ceo' or profile.position in ('ops_manager', 'ops_assistant'))
  ));

create policy "CEO and Ops can manage Design CS people"
  on public.design_cs_people for all to authenticated
  using (exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.is_active is true
      and (profile.role = 'ceo' or profile.position in ('ops_manager', 'ops_assistant'))
  ))
  with check (exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.is_active is true
      and (profile.role = 'ceo' or profile.position in ('ops_manager', 'ops_assistant'))
  ));

create policy "CEO and Ops can manage Design CS allocations"
  on public.design_cs_allocations for all to authenticated
  using (exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.is_active is true
      and (profile.role = 'ceo' or profile.position in ('ops_manager', 'ops_assistant'))
  ))
  with check (exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.is_active is true
      and (profile.role = 'ceo' or profile.position in ('ops_manager', 'ops_assistant'))
  ));

create policy "CEO and Ops can manage Design CS settings"
  on public.design_cs_capacity_settings for all to authenticated
  using (exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.is_active is true
      and (profile.role = 'ceo' or profile.position in ('ops_manager', 'ops_assistant'))
  ))
  with check (exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.is_active is true
      and (profile.role = 'ceo' or profile.position in ('ops_manager', 'ops_assistant'))
  ));

-- Raw legacy payloads and hiring decisions contain CEO-level planning context.
create policy "CEO can read Design CS import snapshots"
  on public.design_cs_import_snapshots for select to authenticated
  using (exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid()) and profile.is_active is true and profile.role = 'ceo'
  ));

create policy "CEO can insert Design CS import snapshots"
  on public.design_cs_import_snapshots for insert to authenticated
  with check (exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid()) and profile.is_active is true and profile.role = 'ceo'
  ));

create policy "CEO can manage hiring roadmap"
  on public.hiring_roadmap_items for all to authenticated
  using (exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid()) and profile.is_active is true and profile.role = 'ceo'
  ))
  with check (exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid()) and profile.is_active is true and profile.role = 'ceo'
  ));

comment on table public.design_cs_allocations is
  'Monthly production allocation imported from Design/CS and maintained in Company Command.';
comment on column public.design_cs_allocations.client_name_snapshot is
  'Historical client label retained even when a roster client is renamed or archived.';
comment on table public.hiring_roadmap_items is
  'CEO-only hiring decisions supported by live Design/CS capacity metrics.';
