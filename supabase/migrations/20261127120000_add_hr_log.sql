-- HR Log: the HR issue log moves from the ClickUp form "HR Issue Tracking Log" into the CCC from 2027.
-- Vanessa, 26 Nov 2026: start fresh (the 2026 ClickUp responses stay in ClickUp). Same fields as her form.
-- Personal HR records: only the CEO and management can read or write them (not ops, not the AI engineer).
-- This file holds the table only. Never put HR records in this repository.

create table public.hr_log_entries (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (char_length(btrim(subject)) between 1 and 200),
  team_member text not null check (char_length(btrim(team_member)) between 1 and 120),
  what_happened text not null check (char_length(btrim(what_happened)) between 1 and 5000),
  incident_date date,
  status text not null default 'No Action' check (status in ('Open', 'Escalated', 'No Action')),
  category text not null default 'Complaint' check (char_length(btrim(category)) between 1 and 60),
  severity text not null default 'Minor' check (char_length(btrim(severity)) between 1 and 60),
  topic_category text check (char_length(topic_category) <= 80),
  slack_link text check (slack_link is null or (char_length(slack_link) <= 500 and slack_link ~ '^https://')),
  follow_up boolean not null default false,
  follow_up_date date,
  consequences boolean not null default false,
  what_consequences text check (char_length(what_consequences) <= 2000),
  agreements text check (char_length(agreements) <= 2000),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.hr_log_entries is
  'HR Log page (CEO and management only). One row per logged HR issue, same fields as the 2026 ClickUp form "HR Issue Tracking Log". '
  'status: Open, Escalated or No Action. category, severity and topic_category are free text so new options need no database change.';

create index hr_log_entries_incident_idx on public.hr_log_entries (incident_date desc);
create index hr_log_entries_member_idx on public.hr_log_entries (lower(team_member));
create index hr_log_entries_created_by_idx on public.hr_log_entries (created_by);
create index hr_log_entries_updated_by_idx on public.hr_log_entries (updated_by);

alter table public.hr_log_entries enable row level security;
revoke all on table public.hr_log_entries from anon;
grant select, insert, update, delete on table public.hr_log_entries to authenticated;
-- Supabase's default grants also give truncate (which ignores row level security), references and trigger.
revoke truncate, references, trigger on table public.hr_log_entries from authenticated;
grant all on table public.hr_log_entries to service_role;

-- get_my_role() does not look at is_active; HR records need an active CEO or management account.
create function public.can_manage_hr_log() returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('ceo', 'management') and is_active is not false
  );
$$;
revoke all on function public.can_manage_hr_log() from public, anon;
grant execute on function public.can_manage_hr_log() to authenticated;

create policy "Active CEO and management manage the HR log"
  on public.hr_log_entries for all to authenticated
  using ((select public.can_manage_hr_log()))
  with check ((select public.can_manage_hr_log()));

-- Who wrote or changed an entry comes from the signed-in user, never from what the browser sends.
create function public.stamp_hr_log_entries() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  new.updated_at := now();
  return new;
end $$;

create trigger hr_log_entries_stamp before insert or update on public.hr_log_entries
  for each row execute function public.stamp_hr_log_entries();
