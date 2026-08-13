create index if not exists design_cs_months_updated_by_idx
  on public.design_cs_months (updated_by);

create index if not exists design_cs_allocations_strategist_key_idx
  on public.design_cs_allocations (strategist_key);
create index if not exists design_cs_allocations_updated_by_idx
  on public.design_cs_allocations (updated_by);

create index if not exists design_cs_capacity_settings_updated_by_idx
  on public.design_cs_capacity_settings (updated_by);

create index if not exists design_cs_import_snapshots_imported_by_idx
  on public.design_cs_import_snapshots (imported_by);

create index if not exists hiring_roadmap_items_created_by_idx
  on public.hiring_roadmap_items (created_by);
create index if not exists hiring_roadmap_items_updated_by_idx
  on public.hiring_roadmap_items (updated_by);
