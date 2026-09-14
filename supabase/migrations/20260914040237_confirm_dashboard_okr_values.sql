-- Preserve existing values while distinguishing the default zero from an
-- explicitly confirmed measurement in the dashboard.
alter table public.key_results
  add column if not exists current_value_recorded_at timestamptz;

comment on column public.key_results.current_value_recorded_at is
  'When an editor explicitly confirmed the current metric value. Null legacy zero values may be database defaults, not measurements.';
