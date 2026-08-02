create table if not exists public.client_churn_profiles (
  client_id uuid primary key references public.clients(id) on delete cascade,
  engagement_start date,
  engagement_end date,
  monthly_retainer numeric(12, 2) check (monthly_retainer is null or monthly_retainer >= 0),
  exit_type text check (
    exit_type is null or exit_type in (
      'client_decision',
      'agency_decision',
      'mutual',
      'project_completed'
    )
  ),
  churn_reason text check (
    churn_reason is null or churn_reason in (
      'performance',
      'creative_quality',
      'communication',
      'budget',
      'strategy_fit',
      'service_scope',
      'price_value',
      'client_internal',
      'agency_capacity',
      'project_completed',
      'other'
    )
  ),
  preventability text check (
    preventability is null or preventability in (
      'preventable',
      'partially_preventable',
      'not_preventable'
    )
  ),
  churn_notes text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_churn_dates_valid check (
    engagement_end is null
    or engagement_start is null
    or engagement_end >= engagement_start
  )
);

comment on table public.client_churn_profiles is
  'Management-only client lifecycle and churn analysis data. One row represents one client engagement record.';

comment on column public.client_churn_profiles.monthly_retainer is
  'Monthly recurring revenue in USD for gross revenue churn analysis.';

alter table public.client_churn_profiles enable row level security;

revoke all on table public.client_churn_profiles from anon;
grant select, insert, update, delete on table public.client_churn_profiles to authenticated;
grant all on table public.client_churn_profiles to service_role;

drop policy if exists "Management can read client churn profiles" on public.client_churn_profiles;
create policy "Management can read client churn profiles"
  on public.client_churn_profiles
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role in ('ceo', 'management')
    )
  );

drop policy if exists "Management can insert client churn profiles" on public.client_churn_profiles;
create policy "Management can insert client churn profiles"
  on public.client_churn_profiles
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role in ('ceo', 'management')
    )
  );

drop policy if exists "Management can update client churn profiles" on public.client_churn_profiles;
create policy "Management can update client churn profiles"
  on public.client_churn_profiles
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role in ('ceo', 'management')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role in ('ceo', 'management')
    )
  );

drop policy if exists "Management can delete client churn profiles" on public.client_churn_profiles;
create policy "Management can delete client churn profiles"
  on public.client_churn_profiles
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role in ('ceo', 'management')
    )
  );

create index if not exists client_churn_profiles_end_idx
  on public.client_churn_profiles (engagement_end desc)
  where engagement_end is not null;

create index if not exists client_churn_profiles_reason_idx
  on public.client_churn_profiles (churn_reason)
  where churn_reason is not null;

create index if not exists client_churn_profiles_updated_by_idx
  on public.client_churn_profiles (updated_by)
  where updated_by is not null;
