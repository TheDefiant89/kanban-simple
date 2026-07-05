import type { TaskFilters, TaskWithRelations } from "@/types";
import { addDays, parseDate, startOfToday } from "./dates";

export type TaskPredicate = (task: TaskWithRelations) => boolean;

/**
 * Builds a predicate for the given filters. Date boundaries, lookup sets
 * and the lowercased search query are computed once here instead of per
 * task, since the returned predicate runs in the board's render hot loop.
 */
export function buildTaskPredicate(filters: TaskFilters): TaskPredicate {
  const query = filters.search.trim().toLowerCase();
  const priorities = filters.priorities.length > 0 ? new Set(filters.priorities) : null;
  const tagIds = filters.tagIds.length > 0 ? new Set(filters.tagIds) : null;
  const dueCheck = buildDueCheck(filters.due);
  const hideCompleted = filters.due !== "completed" && !filters.showCompleted;

  return (task) => {
    if (hideCompleted && task.completed_at) return false;
    if (dueCheck && !dueCheck(task)) return false;
    if (priorities && !priorities.has(task.priority)) return false;
    if (tagIds && !task.tags.some((t) => tagIds.has(t.id))) return false;
    if (query) {
      const inTitle = task.title.toLowerCase().includes(query);
      const inDescription = task.description?.toLowerCase().includes(query) ?? false;
      const inTags = task.tags.some((t) => t.name.toLowerCase().includes(query));
      if (!inTitle && !inDescription && !inTags) return false;
    }
    return true;
  };
}

/** Predicate checking the due date falls in [start, end) local time. */
function dueBetween(start: Date, end: Date): TaskPredicate {
  return (task) => {
    const date = parseDate(task.due_date);
    return !!date && date >= start && date < end;
  };
}

function buildDueCheck(due: TaskFilters["due"]): TaskPredicate | null {
  const today = startOfToday();
  switch (due) {
    case "completed":
      return (task) => !!task.completed_at;
    case "overdue":
      return (task) => {
        if (task.completed_at) return false;
        const date = parseDate(task.due_date);
        return !!date && date < today;
      };
    case "today":
      return dueBetween(today, addDays(today, 1));
    case "tomorrow":
      return dueBetween(addDays(today, 1), addDays(today, 2));
    case "week": {
      // ISO week: Monday 00:00 through the following Monday (exclusive).
      const weekStart = addDays(today, -((today.getDay() + 6) % 7));
      return dueBetween(weekStart, addDays(weekStart, 7));
    }
    case "month": {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      return dueBetween(monthStart, nextMonthStart);
    }
    case "none":
      return (task) => !task.due_date;
    default:
      return null;
  }
}
