-- Fix: tags (and subtasks) did not persist across recurring-task occurrences.
--
-- spawn_recurring_task() runs `after update on tasks` and, when a recurring
-- task is completed, inserts a fresh copy of the task with its dates shifted
-- forward. The original definition (20260703000000_initial_schema.sql) copied
-- only the scalar columns living on the `tasks` row itself. Tags live in the
-- `task_tags` join table and subtasks in the `subtasks` table, so neither was
-- carried over — every new occurrence spawned tagless and checklist-less.
--
-- This redefinition captures the spawned task's id and copies the completed
-- task's tags and subtasks onto it. Subtasks are copied with is_completed reset
-- to false: the new occurrence is fresh work, not a record of the prior one.
-- Start/due dates are still advanced and completed_at is left null (never set
-- on the insert), matching the "copy everything except start/complete date"
-- expectation.
--
-- Preserves `security definer set search_path = public` so the function keeps
-- running as the table owner and is unaffected by the EXECUTE revoke in
-- 20260704000000_harden_function_security.sql.

create or replace function public.spawn_recurring_task()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  next_start date;
  next_due date;
  day_shift integer;
  new_task_id uuid;
begin
  if new.completed_at is not null
     and old.completed_at is null
     and new.recurrence_type <> 'none' then

    day_shift := case new.recurrence_type
      when 'daily' then 1
      when 'weekly' then 7
      when 'monthly' then 30
      else 1 -- 'custom': best-effort daily fallback until cron parsing is handled server-side
    end;

    if new.recurrence_type = 'monthly' then
      next_start := case when new.start_date is not null then new.start_date + interval '1 month' end;
      next_due := case when new.due_date is not null then new.due_date + interval '1 month' end;
    else
      next_start := case when new.start_date is not null then new.start_date + day_shift end;
      next_due := case when new.due_date is not null then new.due_date + day_shift end;
    end if;

    insert into public.tasks (
      project_id, column_id, user_id, title, description, position,
      priority, start_date, due_date, recurrence_type, recurrence_cron,
      recurrence_parent_id
    ) values (
      new.project_id, new.column_id, new.user_id, new.title, new.description, new.position,
      new.priority, next_start, next_due, new.recurrence_type, new.recurrence_cron,
      coalesce(new.recurrence_parent_id, new.id)
    )
    returning id into new_task_id;

    -- Carry over the tags from the completed task.
    insert into public.task_tags (task_id, tag_id, user_id)
    select new_task_id, tt.tag_id, tt.user_id
    from public.task_tags tt
    where tt.task_id = new.id;

    -- Carry over the subtasks, reset to incomplete for the fresh occurrence.
    insert into public.subtasks (task_id, user_id, title, is_completed, position)
    select new_task_id, s.user_id, s.title, false, s.position
    from public.subtasks s
    where s.task_id = new.id;

    insert into public.activity_log (user_id, project_id, task_id, action, metadata)
    values (new.user_id, new.project_id, new.id, 'recurring_task_completed',
      jsonb_build_object('recurrence_type', new.recurrence_type));
  end if;

  return new;
end;
$$;
