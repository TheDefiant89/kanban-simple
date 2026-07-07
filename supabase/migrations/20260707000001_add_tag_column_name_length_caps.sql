-- Fixes GitHub issue #23: every other user-editable free-text field is
-- capped both in its zod schema and by a mirroring DB constraint (project
-- name <= 80, project description <= 500, task title <= 200, task
-- description <= 5000), but columns.name and tags.name had only a
-- "not empty after trim" check with no upper bound -- allowing a direct
-- PostgREST call to insert/update an arbitrarily large name, bypassing the
-- UI entirely.
--
-- Add matching length caps so the DB-level guarantee holds regardless of
-- client-side validation.

alter table public.columns
  add constraint columns_name_length check (char_length(name) <= 100);

alter table public.tags
  add constraint tags_name_length check (char_length(name) <= 50);
