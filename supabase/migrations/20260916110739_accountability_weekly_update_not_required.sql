-- Expand the allowed status without rewriting any existing accountability logs.
alter table public.accountability_logs
  drop constraint accountability_logs_weekly_update_status_check,
  add constraint accountability_logs_weekly_update_status_check
    check (weekly_update_status in ('sent', 'partial', 'not_sent', 'not_required'));

comment on column public.accountability_logs.weekly_update_status is
  'Weekly update result: sent, partial, not_sent, or not_required. Not required is exempt from the accountability score for this week. The legacy weekly_update_sent field remains synchronized.';
