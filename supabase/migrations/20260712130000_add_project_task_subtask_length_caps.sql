-- Fixes GitHub issue #40: unlike columns.name / tags.name (#23) and the
-- color columns (#27), projects.name/description, tasks.title/description/
-- recurrence_cron, and subtasks.title were never given a DB-level upper
-- bound -- only a "not empty after trim" check (or no check at all for the
-- optional text columns). A direct PostgREST call with a valid session can
-- bypass the app's zod schemas entirely and write arbitrarily large strings
-- into any of these fields, since RLS only checks row ownership, not
-- payload size.
--
-- Add matching length caps, mirroring the client-side zod limits in
-- src/features/dashboard/schemas.ts and src/features/tasks/schemas.ts, so
-- the DB-level guarantee holds regardless of client-side validation.

alter table public.projects
  add constraint projects_name_length check (char_length(name) <= 80),
  add constraint projects_description_length check (description is null or char_length(description) <= 500);

alter table public.tasks
  add constraint tasks_title_length check (char_length(title) <= 200),
  add constraint tasks_description_length check (description is null or char_length(description) <= 5000),
  add constraint tasks_recurrence_cron_length check (recurrence_cron is null or char_length(recurrence_cron) <= 200);

alter table public.subtasks
  add constraint subtasks_title_length check (char_length(title) <= 200);
