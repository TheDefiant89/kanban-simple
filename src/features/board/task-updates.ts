import type { Tag, Task, TaskWithRelations } from "@/types";

/**
 * Whether saving `row` over `before` made the database spawn the next
 * occurrence of a recurring task (spawn_recurring_task fires when a
 * recurring task goes from open to completed). That inserts a row -- and
 * shifts positions to make room -- so the board has to be re-fetched;
 * every other task update changes only the row itself.
 */
export function spawnsNextOccurrence(before: TaskWithRelations, row: Task) {
  return !before.completed_at && !!row.completed_at && row.recurrence_type !== "none";
}

/** Tag ids to link and unlink to get from `before` to `afterIds`. */
export function diffTags(before: Tag[], afterIdList: string[]) {
  const beforeIds = new Set(before.map((t) => t.id));
  const afterIds = new Set(afterIdList);
  return {
    add: [...afterIds].filter((id) => !beforeIds.has(id)),
    remove: [...beforeIds].filter((id) => !afterIds.has(id)),
  };
}
