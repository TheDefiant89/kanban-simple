-- Recurring tasks completed late: schedule the next occurrence from the
-- completion date.
--
-- Until now the next occurrence was always the missed due date plus one
-- interval (or the next cron match after it). Completing a weekly task that
-- was due five weeks ago therefore spawned one due four weeks ago --
-- already overdue -- and every completion after that did the same until
-- the chain caught up with today.
--
-- Now, when a task is completed after its due date (compared as UTC
-- calendar days, as the rest of this trigger does), the next due date is
-- counted from the completion day instead: completion + 1 day / 7 days /
-- 1 month, or the next cron match after the completion day. The start date
-- keeps its original offset from the due date. Tasks completed on or
-- before their due date, and tasks without a due date, are scheduled
-- exactly as before.
--
-- The function body is otherwise identical to
-- 20261120040000_restore_recurring_tag_copy.sql (tag and subtask carry-over
-- included). No data changes.

create or replace function public.spawn_recurring_task()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  next_start date;
  next_due date;
  day_shift integer;
  anchor date;
  next_anchor date;
  new_task_id uuid;
  completed_on date;
  late boolean;
begin
  if new.completed_at is not null
     and old.completed_at is null
     and new.recurrence_type <> 'none' then

    -- Completed after its due date: schedule the next occurrence from the
    -- completion day rather than the missed due date, so a long-overdue
    -- task doesn't spawn an occurrence that is already overdue (and then
    -- another, and another). On-time and early completions keep the
    -- original schedule.
    completed_on := (new.completed_at at time zone 'UTC')::date;
    late := new.due_date is not null and completed_on > new.due_date;

    if new.recurrence_type = 'custom'
       and nullif(btrim(coalesce(new.recurrence_cron, '')), '') is not null then

      -- Anchor on the due date (the scheduling date), falling back to the
      -- start date and then the completion date, so a cron task still gets a
      -- concrete next date even if it had no dates set.
      anchor := case
        when late then completed_on
        else coalesce(new.due_date, new.start_date, completed_on)
      end;
      next_anchor := next_cron_date(new.recurrence_cron, anchor);

      if next_anchor is not null then
        if new.due_date is not null then
          next_due := next_anchor;
          -- Preserve the original start -> due offset.
          if new.start_date is not null then
            next_start := new.start_date + (next_anchor - new.due_date);
          end if;
        elsif new.start_date is not null then
          next_start := next_anchor;
        else
          next_due := next_anchor;
        end if;
      else
        -- Unparseable cron: fall back to a daily shift so the task keeps
        -- recurring rather than silently stopping.
        next_start := case when new.start_date is not null then new.start_date + 1 end;
        next_due := case when new.due_date is not null then new.due_date + 1 end;
      end if;

    else
      day_shift := case new.recurrence_type
        when 'daily' then 1
        when 'weekly' then 7
        when 'monthly' then 30
        else 1
      end;

      if late then
        next_due := case
          when new.recurrence_type = 'monthly' then (completed_on + interval '1 month')::date
          else completed_on + day_shift
        end;
        -- Preserve the original start -> due offset.
        if new.start_date is not null then
          next_start := next_due - (new.due_date - new.start_date);
        end if;
      elsif new.recurrence_type = 'monthly' then
        next_start := case when new.start_date is not null then new.start_date + interval '1 month' end;
        next_due := case when new.due_date is not null then new.due_date + interval '1 month' end;
      else
        next_start := case when new.start_date is not null then new.start_date + day_shift end;
        next_due := case when new.due_date is not null then new.due_date + day_shift end;
      end if;
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

revoke execute on function public.spawn_recurring_task() from public;
