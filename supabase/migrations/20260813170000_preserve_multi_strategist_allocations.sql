-- Preserve all Client Roster creative strategist assignments in monthly snapshots.
-- Existing single-strategist history is retained and backfilled into the array.

alter table public.design_cs_allocations
  add column if not exists strategist_keys text[] not null default '{}';

update public.design_cs_allocations
set strategist_keys = array[strategist_key]
where strategist_key is not null
  and cardinality(strategist_keys) = 0;

create index if not exists design_cs_allocations_strategist_keys_idx
  on public.design_cs_allocations using gin (strategist_keys);

comment on column public.design_cs_allocations.strategist_keys is
  'Creative strategist source keys captured from the Client Roster for this monthly snapshot.';
