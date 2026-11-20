-- Stop tasks sharing a position within a column, and renumber the ones that
-- already do.
--
-- Duplicate positions came from three places:
--   * the recurring-task trigger (spawn_next_recurring_task) inserts the next
--     occurrence at the completed task's own position;
--   * duplicateTask (src/services/tasks.ts) inserts the copy at
--     original.position + 1, which is normally the next task's slot;
--   * new tasks used to be placed at the column's loaded task count, which
--     under-counted once boards passed PostgREST's 1000-row cap (fixed
--     client-side in #83).
-- With ties the board order was arbitrary, and new tasks landed mid-column.
--
-- 1. A BEFORE INSERT trigger makes room: when the new row's position is
--    already taken in its column, every task at or after it shifts down by
--    one. A recurring task's next occurrence therefore takes the completed
--    task's slot and the completed one sits right after it; a duplicated
--    task sits right after its original. Inserts at a free position (the
--    normal "add task" path, which uses max + 1) touch nothing else.
-- 2. A one-time pass renumbers every column 0..n-1, preserving the current
--    on-screen order (position, then id -- the tie-break the board uses
--    since #83). Archived tasks are renumbered too so they come back in a
--    sensible place if unarchived.
--
-- No unique constraint: drag-and-drop writes only the rows that changed
-- (src/features/board/reorder.ts) from the client's cached view, so a stale
-- cache would turn a harmless tie into a failed drop.

create or replace function public.make_room_for_task_position()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1 from tasks
    where column_id = new.column_id and position = new.position
  ) then
    update tasks
    set position = position + 1
    where column_id = new.column_id and position >= new.position;
  end if;
  return new;
end;
$$;

revoke all on function public.make_room_for_task_position() from public, anon, authenticated;

drop trigger if exists tasks_make_room_for_position on public.tasks;
create trigger tasks_make_room_for_position
  before insert on public.tasks
  for each row execute function public.make_room_for_task_position();

create index if not exists tasks_column_id_position_idx
  on public.tasks (column_id, position);

-- One-time renumber. Only rows whose position actually changes are written,
-- and updated_at is left alone: this is housekeeping, not a user edit.
alter table public.tasks disable trigger set_tasks_updated_at;

update public.tasks t
set position = r.new_position
from (
  select id, (row_number() over (partition by column_id order by position, id) - 1)::int as new_position
  from public.tasks
) r
where t.id = r.id and t.position <> r.new_position;

alter table public.tasks enable trigger set_tasks_updated_at;
