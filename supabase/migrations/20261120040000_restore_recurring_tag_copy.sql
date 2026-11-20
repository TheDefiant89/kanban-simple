-- Restore tag and subtask carry-over on recurring tasks.
--
-- 20260708000000_recurring_task_copy_tags.sql made spawn_recurring_task copy
-- the completed task's tags and subtasks onto the next occurrence. The
-- custom-cron rewrite in 20260907000000_custom_cron_recurrence.sql replaced
-- the whole function from an older copy and silently dropped both, so every
-- occurrence spawned since then started with no tags and no subtasks.
--
-- 1. Re-create the function: identical to the 20260907 version (cron
--    scheduling included) plus the two carry-over inserts.
-- 2. Backfill open occurrences that lost them: a spawned, not-yet-completed,
--    non-archived occurrence with no tags gets the tags of the most recently
--    completed task in its recurrence chain that has tags; likewise for
--    subtasks (reset to incomplete). Occurrences that already have tags or
--    subtasks -- e.g. re-added by hand -- are left alone.

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
begin
  if new.completed_at is not null
     and old.completed_at is null
     and new.recurrence_type <> 'none' then

    if new.recurrence_type = 'custom'
       and nullif(btrim(coalesce(new.recurrence_cron, '')), '') is not null then

      -- Anchor on the due date (the scheduling date), falling back to the
      -- start date and then the completion date, so a cron task still gets a
      -- concrete next date even if it had no dates set.
      anchor := coalesce(
        new.due_date,
        new.start_date,
        (new.completed_at at time zone 'UTC')::date
      );
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

      if new.recurrence_type = 'monthly' then
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

-- Backfill tags.
with open_occurrences as (
  select t.id, t.recurrence_parent_id as root
  from public.tasks t
  where t.recurrence_parent_id is not null
    and t.recurrence_type <> 'none'
    and t.completed_at is null
    and t.is_archived = false
    and not exists (select 1 from public.task_tags tt where tt.task_id = t.id)
),
sources as (
  select o.id as target, (
    select s.id from public.tasks s
    where (s.id = o.root or s.recurrence_parent_id = o.root)
      and s.completed_at is not null
      and exists (select 1 from public.task_tags tt where tt.task_id = s.id)
    order by s.completed_at desc
    limit 1
  ) as source
  from open_occurrences o
)
insert into public.task_tags (task_id, tag_id, user_id)
select src.target, tt.tag_id, tt.user_id
from sources src
join public.task_tags tt on tt.task_id = src.source;

-- Backfill subtasks.
with open_occurrences as (
  select t.id, t.recurrence_parent_id as root
  from public.tasks t
  where t.recurrence_parent_id is not null
    and t.recurrence_type <> 'none'
    and t.completed_at is null
    and t.is_archived = false
    and not exists (select 1 from public.subtasks st where st.task_id = t.id)
),
sources as (
  select o.id as target, (
    select s.id from public.tasks s
    where (s.id = o.root or s.recurrence_parent_id = o.root)
      and s.completed_at is not null
      and exists (select 1 from public.subtasks st where st.task_id = s.id)
    order by s.completed_at desc
    limit 1
  ) as source
  from open_occurrences o
)
insert into public.subtasks (task_id, user_id, title, is_completed, position)
select src.target, st.user_id, st.title, false, st.position
from sources src
join public.subtasks st on st.task_id = src.source;
