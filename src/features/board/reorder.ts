import type { TaskWithRelations } from "@/types";

export interface TaskPositionUpdate {
  id: string;
  position: number;
  column_id: string;
}

/**
 * Merges the new visible (filtered) order of a column back into its full,
 * unfiltered task list.
 *
 * The board mirrors only tasks that match the active filters, so a drag
 * reorder expresses ordering constraints for the visible tasks only.
 * Persisting `index` positions computed from the filtered list would
 * collide with (and scramble) hidden tasks' positions — completed tasks
 * are hidden by default, so that would corrupt almost any real board.
 * Instead, hidden tasks keep their place relative to the nearest visible
 * task that precedes them, and the moved task is inserted at its new
 * visible position.
 *
 * @param fullTasks    Current full task list of the column in server order
 *                     (may or may not include the moved task).
 * @param visibleTasks New visible order for the column after the drop
 *                     (includes the moved task if this column is its
 *                     destination, excludes it if it just left).
 * @param movedTaskId  The dragged task's id.
 * @returns The column's complete task list in its new order.
 */
export function mergeVisibleOrder(
  fullTasks: TaskWithRelations[],
  visibleTasks: TaskWithRelations[],
  movedTaskId: string
): TaskWithRelations[] {
  const visibleIds = new Set(visibleTasks.map((t) => t.id));

  // Anchor each hidden task to the visible task that precedes it (or null
  // for hidden tasks before the first visible one). The moved task counts
  // as an anchor while it stays in this column, so a drop that doesn't
  // actually move it leaves the order untouched; when it leaves the
  // column, its trailing hidden tasks re-anchor to the previous visible
  // task, i.e. they keep their place.
  const hiddenByAnchor = new Map<string | null, TaskWithRelations[]>();
  let anchor: string | null = null;
  for (const task of fullTasks) {
    if (task.id === movedTaskId) {
      // Emitted from visibleTasks below, never from fullTasks.
      if (visibleIds.has(task.id)) anchor = task.id;
    } else if (visibleIds.has(task.id)) {
      anchor = task.id;
    } else {
      const bucket = hiddenByAnchor.get(anchor);
      if (bucket) bucket.push(task);
      else hiddenByAnchor.set(anchor, [task]);
    }
  }

  const merged: TaskWithRelations[] = [...(hiddenByAnchor.get(null) ?? [])];
  for (const task of visibleTasks) {
    merged.push(task);
    const trailing = hiddenByAnchor.get(task.id);
    if (trailing) merged.push(...trailing);
  }
  return merged;
}

/**
 * Turns a column's merged full order into the minimal set of position
 * writes: only tasks whose position or column actually changed are
 * included, so a typical drop persists a handful of rows instead of
 * every task in both columns.
 */
export function buildPositionUpdates(
  merged: TaskWithRelations[],
  columnId: string,
  previousById: Map<string, TaskWithRelations>
): TaskPositionUpdate[] {
  const updates: TaskPositionUpdate[] = [];
  merged.forEach((task, index) => {
    const previous = previousById.get(task.id);
    if (!previous || previous.position !== index || previous.column_id !== columnId) {
      updates.push({ id: task.id, position: index, column_id: columnId });
    }
  });
  return updates;
}
