-- Client Incubator dashboard: membership overrides, client goals, and a read-only mirror of ClickUp tasks.
-- Risk, relationship and spend come from client_health_entries and spend_entries; actions reuse client_actions.

create table public.client_incubator (
  client_id uuid primary key references public.clients(id) on delete cascade,
  status text not null check (status in ('active', 'graduated')),
  note text check (char_length(note) <= 500),
  graduated_at timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.client_incubator is
  'Overrides the tenure rule (clients in months 0-3 are in the incubator automatically): active = moved in by hand, graduated = taken out after review. Deleting the row returns the client to the tenure rule.';

create table public.client_goals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  metric text not null check (char_length(metric) between 1 and 200),
  target text check (char_length(target) <= 200),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index client_goals_client_order_idx on public.client_goals (client_id, created_at, id);

create table public.clickup_client_tasks (
  task_id text primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  status text not null,
  due_date date,
  closed_at timestamptz,
  url text,
  assignees text[] not null default '{}',
  synced_at timestamptz not null default now()
);

comment on table public.clickup_client_tasks is
  '[Int] Ads Board tasks linked to a client through the ClickUp Client Space field. Written only by the ClickUp sync (service role); due_date is the ClickUp due day in Asia/Dubai.';

create index clickup_client_tasks_client_idx on public.clickup_client_tasks (client_id);

alter table public.client_incubator enable row level security;
alter table public.client_goals enable row level security;
alter table public.clickup_client_tasks enable row level security;

create policy "Ops/Mgmt can manage client_incubator"
  on public.client_incubator for all to authenticated
  using ((select public.can_manage_ops()))
  with check ((select public.can_manage_ops()));

create policy "Ops/Mgmt can manage client_goals"
  on public.client_goals for all to authenticated
  using ((select public.can_manage_ops()))
  with check ((select public.can_manage_ops()));

-- Read-only for people; the sync writes with the service role, which bypasses RLS.
create policy "Ops/Mgmt can read clickup_client_tasks"
  on public.clickup_client_tasks for select to authenticated
  using ((select public.can_manage_ops()));

-- Who made a change is taken from the signed-in user, never from what the browser sends.
create function public.stamp_client_incubator() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end $$;

create trigger client_incubator_stamp before insert or update on public.client_incubator
  for each row execute function public.stamp_client_incubator();

create function public.stamp_client_goals() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger client_goals_stamp before insert or update on public.client_goals
  for each row execute function public.stamp_client_goals();
