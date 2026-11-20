import type { ColumnSort, Priority, TaskWithRelations } from "@/types";

export const COLUMN_SORT_LABELS: Record<ColumnSort, string> = {
  custom: "Custom order",
  priority: "Priority",
  due_date: "Due date",
  name: "Name",
  tag: "Tag",
};

export const COLUMN_SORTS: ColumnSort[] = ["custom", "priority", "due_date", "name", "tag"];

// Highest priority first.
const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

type Comparator = (a: TaskWithRelations, b: TaskWithRelations) => number;

/** Empty values (no due date, no tags) always sort after filled ones. */
function emptyLast(a: string | null, b: string | null, compare: (x: string, y: string) => number) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compare(a, b);
}

/** Alphabetically first tag name, so a task sorts under its "earliest" tag. */
function firstTagName(task: TaskWithRelations): string | null {
  let first: string | null = null;
  for (const tag of task.tags) {
    if (first === null || collator.compare(tag.name, first) < 0) first = tag.name;
  }
  return first;
}

const COMPARATORS: Record<Exclude<ColumnSort, "custom">, Comparator> = {
  priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  // due_date is a plain YYYY-MM-DD string, so string order is date order.
  due_date: (a, b) => emptyLast(a.due_date, b.due_date, (x, y) => (x < y ? -1 : x > y ? 1 : 0)),
  name: (a, b) => collator.compare(a.title, b.title),
  tag: (a, b) => emptyLast(firstTagName(a), firstTagName(b), collator.compare),
};

/**
 * Returns the tasks in the column's display order. "custom" is the stored
 * drag-and-drop order; every other sort falls back to it for ties, so equal
 * tasks keep their hand-arranged order. Never mutates the input.
 */
export function sortTasks(tasks: TaskWithRelations[], sortBy: ColumnSort): TaskWithRelations[] {
  const byPosition: Comparator = (a, b) => a.position - b.position || (a.id < b.id ? -1 : 1);
  if (sortBy === "custom") return [...tasks].sort(byPosition);
  const compare = COMPARATORS[sortBy];
  return [...tasks].sort((a, b) => compare(a, b) || byPosition(a, b));
}
