-- Team Churn page: one row per stint a person spent on the team (rehires get a second row).
-- Seeded from the ClickUp HR list (Member Contact Information, read 19-20 Nov 2026) plus the 2025 leavers
-- found in Slack who were never put on that list. Management keeps it current from the page.

create table public.team_member_tenures (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  department text not null check (department in
    ('media_buyers', 'creative_strategists', 'designers', 'video_editors', 'other', 'unknown')),
  start_date date,
  end_date date,
  exit_type text check (exit_type in ('fired', 'quit')),
  source text not null default 'Added in the CCC' check (char_length(source) <= 120),
  clickup_task_id text unique,
  notes text check (char_length(notes) <= 1000),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_member_tenures_dates check (end_date is null or start_date is null or end_date >= start_date),
  constraint team_member_tenures_exit_needs_end check (exit_type is null or end_date is not null)
);

comment on table public.team_member_tenures is
  'Team Churn page. end_date = last working day (null = still on the team); exit_type null on a leaver = reason unknown. '
  'Department keys: media_buyers (MB), creative_strategists (CS), designers, video_editors; other and unknown are kept out of the four-team totals.';

create index team_member_tenures_end_idx on public.team_member_tenures (end_date desc);
create index team_member_tenures_department_idx on public.team_member_tenures (department);
create index team_member_tenures_updated_by_idx on public.team_member_tenures (updated_by);

alter table public.team_member_tenures enable row level security;
revoke all on table public.team_member_tenures from anon;
grant select, insert, update, delete on table public.team_member_tenures to authenticated;
grant all on table public.team_member_tenures to service_role;

-- Same people as Client Churn Analysis: CEO, management and the provisioned AI engineer.
create policy "Management can manage team member tenures"
  on public.team_member_tenures for all to authenticated
  using ((select public.get_my_role()) = any (array['ceo', 'management']) or (select public.has_ai_engineer_access()))
  with check ((select public.get_my_role()) = any (array['ceo', 'management']) or (select public.has_ai_engineer_access()));

-- Who made a change is taken from the signed-in user, never from what the browser sends.
create function public.stamp_team_member_tenures() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end $$;

create trigger team_member_tenures_stamp before insert or update on public.team_member_tenures
  for each row execute function public.stamp_team_member_tenures();

-- The 115 starting rows (96 ClickUp HR cards + 19 Slack-only 2025 leavers) were loaded straight into the
-- database on 21 Nov 2026. They are names with fired/quit reasons, so they are not kept in this repository.
