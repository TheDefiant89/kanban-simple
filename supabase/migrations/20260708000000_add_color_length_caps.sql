-- Fixes GitHub issue #27: the color column on projects, columns, and tags
-- was never covered by #23's length-cap fix (which only addressed
-- columns.name / tags.name), leaving it fully unconstrained. A direct
-- PostgREST call can bypass the UI's fixed color palette entirely and
-- write an arbitrarily large string into color, with no application or
-- database-level limit.
--
-- Add matching length caps so the DB-level guarantee holds regardless of
-- client-side validation.

alter table public.projects
  add constraint projects_color_length check (char_length(color) <= 20);

alter table public.columns
  add constraint columns_color_length check (char_length(color) <= 20);

alter table public.tags
  add constraint tags_color_length check (char_length(color) <= 20);
