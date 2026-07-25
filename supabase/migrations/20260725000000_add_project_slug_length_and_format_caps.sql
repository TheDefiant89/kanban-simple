-- Fixes GitHub issue #62: projects.slug (added by
-- 20260705000002_add_project_slug.sql) was never given the length/format
-- cap that #23/#27/#40 added to every other free-text column. Client code
-- always derives slug from slugify(name) (src/lib/utils.ts), and name is
-- capped at 80 chars (projects_name_length), but RLS only enforces row
-- ownership -- not payload shape -- so a direct POST/PATCH
-- /rest/v1/projects call with a valid session can set slug to an
-- effectively unbounded string, or to characters outside the [a-z0-9-]
-- shape the app (and the /board/:slug route) assumes.
--
-- Verified against the live project before authoring this: every existing
-- row's slug is well under 100 chars and already matches the format below,
-- so this cap is safe to apply without a backfill.

alter table public.projects
  add constraint projects_slug_length check (char_length(slug) <= 100),
  add constraint projects_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
