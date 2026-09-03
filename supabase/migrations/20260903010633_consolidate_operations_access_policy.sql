-- Consolidate Operations department membership into the existing shared
-- authorization predicate. This avoids stacking extra permissive policies on
-- the client tables while keeping their current management behavior.

create or replace function public.can_manage_ops()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.is_active is true
      and (
        profile.role in ('ceo', 'management')
        or lower(trim(coalesce(profile.department, ''))) = 'operations'
        or profile.position in ('ops_manager', 'ops_assistant')
      )
  );
$$;

revoke all on function public.can_manage_ops() from public, anon, authenticated;
grant execute on function public.can_manage_ops() to authenticated, service_role;

drop policy if exists "Operations department can manage clients" on public.clients;
drop policy if exists "Operations department can manage client health" on public.client_health_entries;
drop policy if exists "Operations department can manage client actions" on public.client_actions;

drop policy if exists "Ops/Mgmt can manage clients" on public.clients;
create policy "Ops/Mgmt can manage clients"
  on public.clients for all to authenticated
  using ((select public.can_manage_ops()))
  with check ((select public.can_manage_ops()));

drop policy if exists "Ops/Mgmt can manage client_health_entries" on public.client_health_entries;
create policy "Ops/Mgmt can manage client_health_entries"
  on public.client_health_entries for all to authenticated
  using ((select public.can_manage_ops()))
  with check ((select public.can_manage_ops()));

drop policy if exists "Ops/Mgmt can manage client_actions" on public.client_actions;
create policy "Ops/Mgmt can manage client_actions"
  on public.client_actions for all to authenticated
  using ((select public.can_manage_ops()))
  with check ((select public.can_manage_ops()));

drop policy if exists "Ops/Mgmt can manage onboarding_checklists" on public.onboarding_checklists;
create policy "Ops/Mgmt can manage onboarding_checklists"
  on public.onboarding_checklists for all to authenticated
  using ((select public.can_manage_ops()))
  with check ((select public.can_manage_ops()));

drop policy if exists "Ops/Mgmt can manage team_reviews" on public.team_reviews;
create policy "Ops/Mgmt can manage team_reviews"
  on public.team_reviews for all to authenticated
  using ((select public.can_manage_ops()))
  with check ((select public.can_manage_ops()));

comment on function public.can_manage_ops() is
  'True for active CEO/management users and active members of the Operations department.';
