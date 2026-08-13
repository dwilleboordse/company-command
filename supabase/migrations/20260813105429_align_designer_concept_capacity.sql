alter table public.design_cs_capacity_settings
  alter column designer_daily_capacity set default 7;

update public.design_cs_capacity_settings
set designer_daily_capacity = editor_daily_capacity + 2,
    updated_at = now()
where id = 1;

update public.design_cs_people
set daily_capacity = (
      select editor_daily_capacity + 2
      from public.design_cs_capacity_settings
      where id = 1
    ),
    updated_at = now()
where discipline = 'designer';
