-- Dashboard stats and task duplication as single RPC calls.
--
-- project_task_stats: the dashboard used to download one row per active
-- task the user owns (paged past PostgREST's 1000-row cap) only to count
-- them per project in the browser. This returns one row per project.
-- "Overdue" depends on the viewer's local calendar day, so the client
-- passes it as p_today rather than the server assuming UTC.
--
-- duplicate_task: copying a task was a task insert followed by separate
-- subtask and tag inserts, so a failure part-way left a partial copy. This
-- does it in one transaction. The copy lands right after the original (the
-- make_room_for_task_position trigger shifts the tasks below), and its
-- title is trimmed so " (copy)" can't push it past the 200-character cap,
-- which used to make duplicating a long-titled task fail outright.
--
-- Both are SECURITY INVOKER with a pinned search_path, like the other RPCs:
-- every read and write goes through the caller's RLS policies, and the
-- explicit user_id filters are defense in depth (and let the planner use
-- the user_id indexes).

create or replace function public.project_task_stats(p_today date)
returns table (
  project_id uuid,
  task_count integer,
  completed_count integer,
  overdue_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.project_id,
    count(*)::int,
    count(*) filter (where t.completed_at is not null)::int,
    count(*) filter (where t.completed_at is null and t.due_date < p_today)::int
  from tasks t
  where t.user_id = (select auth.uid())
    and not t.is_archived
  group by t.project_id;
$$;

create or replace function public.duplicate_task(p_task_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  src public.tasks;
  new_task_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into src from tasks where id = p_task_id and user_id = uid;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  insert into tasks (
    project_id, column_id, user_id, title, description, position, priority,
    start_date, due_date, recurrence_type, recurrence_cron
  )
  values (
    src.project_id, src.column_id, uid,
    rtrim(left(src.title, 200 - char_length(' (copy)'))) || ' (copy)',
    src.description, src.position + 1, src.priority,
    src.start_date, src.due_date, src.recurrence_type, src.recurrence_cron
  )
  returning id into new_task_id;

  insert into subtasks (task_id, user_id, title, is_completed, position)
  select new_task_id, uid, s.title, s.is_completed, s.position
  from subtasks s
  where s.task_id = src.id and s.user_id = uid;

  insert into task_tags (task_id, tag_id, user_id)
  select new_task_id, tt.tag_id, uid
  from task_tags tt
  where tt.task_id = src.id and tt.user_id = uid;

  return new_task_id;
end;
$$;

revoke all on function public.project_task_stats(date) from public;
revoke execute on function public.project_task_stats(date) from anon;
grant execute on function public.project_task_stats(date) to authenticated;

revoke all on function public.duplicate_task(uuid) from public;
revoke execute on function public.duplicate_task(uuid) from anon;
grant execute on function public.duplicate_task(uuid) to authenticated;
