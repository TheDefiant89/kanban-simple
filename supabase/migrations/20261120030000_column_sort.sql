-- Per-column task sort.
--
-- 'custom' is the drag-and-drop order (tasks.position). The other values
-- are computed client-side from the loaded tasks (src/lib/sort-tasks.ts);
-- positions are untouched until someone drags a task into a sorted column,
-- at which point the sorted order (with the move applied) is saved as the
-- column's new custom order and the column switches back to 'custom'.

alter table public.columns
  add column if not exists sort_by text not null default 'custom'
    constraint columns_sort_by_check
      check (sort_by in ('custom', 'priority', 'due_date', 'name', 'tag'));
