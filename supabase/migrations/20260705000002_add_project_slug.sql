-- Persisted, unique-per-user slug for cosmetic /board/:slug URLs.
-- Generated from the project name at creation/rename time (see
-- services/projects.ts), mirroring the existing name-uniqueness pattern:
-- unique among the user's active (non-archived) projects.

alter table public.projects add column slug text;

-- Backfill existing rows.
update public.projects
set slug = nullif(trim(both '-' from regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g')), '');

update public.projects set slug = 'project' where slug is null;

-- De-duplicate any collisions per user by suffixing -2, -3, ...
with numbered as (
  select id, row_number() over (partition by user_id, slug order by created_at) as rn
  from public.projects
)
update public.projects p
set slug = p.slug || '-' || numbered.rn
from numbered
where p.id = numbered.id and numbered.rn > 1;

alter table public.projects alter column slug set not null;

create unique index projects_user_slug_unique
  on public.projects (user_id, slug)
  where is_archived = false;
