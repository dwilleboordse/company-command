-- Weekly KR values can be stored once per role segment.
-- Existing rows stay valid: segment defaults to '' and each previous
-- (key_result_id, user_id, week_start) row remains one unsegmented value.
-- The unique key is widened to include segment. No other table, policy,
-- grant or key-result column changes.
--
-- Rollback SQL is in the block comment at the bottom. Do not run it as
-- part of this migration.

alter table public.kr_values
  add column if not exists segment text not null default '';

alter table public.kr_values
  drop constraint if exists kr_values_segment_label;

alter table public.kr_values
  add constraint kr_values_segment_label
  check (char_length(segment) <= 64 and segment ~ '^[a-z0-9_]*$');

comment on column public.kr_values.segment is
  'Role or other slice of one weekly value. Empty string is the single unsegmented value used by every existing row.';

alter table public.kr_values
  drop constraint if exists kr_values_key_result_id_user_id_week_start_key;

alter table public.kr_values
  add constraint kr_values_key_result_id_user_id_week_start_segment_key
  unique (key_result_id, user_id, week_start, segment);

notify pgrst, 'reload schema';

/*
Rollback — run in its own transaction, and only when this change should be reversed.

If any row has a non-empty segment, restoring the old 3-column unique key fails.
Delete those role rows first if the measurements can be discarded, or do not roll back.

begin;

alter table public.kr_values
  drop constraint if exists kr_values_key_result_id_user_id_week_start_segment_key;

alter table public.kr_values
  drop constraint if exists kr_values_segment_label;

alter table public.kr_values
  add constraint kr_values_key_result_id_user_id_week_start_key
  unique (key_result_id, user_id, week_start);

alter table public.kr_values
  drop column if exists segment;

notify pgrst, 'reload schema';

commit;
*/
