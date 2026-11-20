-- Make project creation and duplication atomic.
--
-- createProject used to insert the project and then its default columns as
-- two separate PostgREST requests, so a failure on the second left a project
-- with no columns. duplicateProject was worse: project, columns, tasks,
-- subtasks and task_tags were five separate requests, so a failure part-way
-- left a half-copied project behind. Each RPC call below runs in a single
-- transaction, so either everything is written or nothing is.
--
-- Both functions are SECURITY INVOKER with a pinned search_path, like the
-- reorder RPCs: every read and write still goes through the caller's RLS
-- policies, and the explicit auth.uid() checks are defense in depth. The
-- client still picks the unique name/slug (src/services/projects.ts); if it
-- races with another write the unique indexes reject the insert and the
-- whole call rolls back cleanly.

create or replace function public.create_project_with_columns(
  p_name text,
  p_slug text,
  p_description text,
  p_color text,
  p_columns jsonb
)
returns public.projects
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_project public.projects;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if jsonb_typeof(p_columns) is distinct from 'array' then
    raise exception 'p_columns must be a jsonb array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_columns) > 50 then
    raise exception 'too many columns: % (max 50)', jsonb_array_length(p_columns)
      using errcode = '22023';
  end if;

  insert into projects (user_id, name, slug, description, color)
  values (uid, p_name, p_slug, p_description, p_color)
  returning * into new_project;

  insert into columns (project_id, user_id, name, color, position)
  select new_project.id, uid, c.value->>'name', c.value->>'color', (c.ordinality - 1)::int
  from jsonb_array_elements(p_columns) with ordinality as c;

  return new_project;
end;
$$;

create or replace function public.duplicate_project(
  p_source_id uuid,
  p_name text,
  p_slug text
)
returns public.projects
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  src public.projects;
  new_project public.projects;
  col record;
  new_column_id uuid;
  t record;
  new_task_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into src from projects where id = p_source_id and user_id = uid;
  if not found then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;

  insert into projects (user_id, name, slug, description, color)
  values (uid, p_name, p_slug, src.description, src.color)
  returning * into new_project;

  for col in
    select * from columns
    where project_id = src.id and user_id = uid
    order by position
  loop
    insert into columns (project_id, user_id, name, color, position, is_collapsed)
    values (new_project.id, uid, col.name, col.color, col.position, col.is_collapsed)
    returning id into new_column_id;

    -- Same task fields the previous client-side copy carried over; archived
    -- tasks stay behind.
    for t in
      select * from tasks
      where column_id = col.id and user_id = uid and is_archived = false
      order by position
    loop
      insert into tasks (
        project_id, column_id, user_id, title, description, position, priority,
        start_date, due_date, recurrence_type, recurrence_cron
      )
      values (
        new_project.id, new_column_id, uid, t.title, t.description, t.position, t.priority,
        t.start_date, t.due_date, t.recurrence_type, t.recurrence_cron
      )
      returning id into new_task_id;

      insert into subtasks (task_id, user_id, title, is_completed, position)
      select new_task_id, uid, s.title, s.is_completed, s.position
      from subtasks s
      where s.task_id = t.id and s.user_id = uid;

      insert into task_tags (task_id, tag_id, user_id)
      select new_task_id, tt.tag_id, uid
      from task_tags tt
      where tt.task_id = t.id and tt.user_id = uid;
    end loop;
  end loop;

  return new_project;
end;
$$;

revoke all on function public.create_project_with_columns(text, text, text, text, jsonb) from public;
revoke execute on function public.create_project_with_columns(text, text, text, text, jsonb) from anon;
grant execute on function public.create_project_with_columns(text, text, text, text, jsonb) to authenticated;

revoke all on function public.duplicate_project(uuid, text, text) from public;
revoke execute on function public.duplicate_project(uuid, text, text) from anon;
grant execute on function public.duplicate_project(uuid, text, text) to authenticated;
