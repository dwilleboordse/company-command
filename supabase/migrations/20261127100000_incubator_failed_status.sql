-- Client Incubator: a third way out. 'failed' = the client left or is leaving before graduating
-- (Vanessa, 26 Nov 2026). graduated_at keeps the day of the decision for both outcomes.

alter table public.client_incubator drop constraint client_incubator_status_check;
alter table public.client_incubator add constraint client_incubator_status_check
  check (status in ('active', 'graduated', 'failed'));

comment on table public.client_incubator is
  'Overrides the tenure rule (clients in months 0-3 are in the incubator automatically): active = moved in by hand, graduated = taken out after a good review, failed = left or leaving before graduating. graduated_at is the day of the decision. Deleting the row returns the client to the tenure rule.';
