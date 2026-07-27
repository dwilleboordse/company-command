alter table public.accountability_logs
  add column if not exists weekly_update_sent boolean not null default false;

comment on column public.accountability_logs.weekly_update_sent is
  'Whether the team member sent their weekly update for this accountability week.';
