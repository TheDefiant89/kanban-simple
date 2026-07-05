import {
  endOfMonth,
  endOfWeek,
  isToday,
  isTomorrow,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { TaskFilters, TaskWithRelations } from "@/types";
import { parseDate } from "./dates";

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

function buildDueCheck(due: TaskFilters["due"]): TaskPredicate | null {
  switch (due) {
    case "completed":
      return (task) => !!task.completed_at;
    case "overdue": {
      const todayStart = startOfDay(new Date());
      return (task) => {
        if (task.completed_at) return false;
        const date = parseDate(task.due_date);
        return !!date && date < todayStart;
      };
    }
    case "today":
      return (task) => {
        const date = parseDate(task.due_date);
        return !!date && isToday(date);
      };
    case "tomorrow":
      return (task) => {
        const date = parseDate(task.due_date);
        return !!date && isTomorrow(date);
      };
    case "week": {
      const now = new Date();
      const start = startOfWeek(now, { weekStartsOn: 1 });
      const end = endOfWeek(now, { weekStartsOn: 1 });
      return (task) => {
        const date = parseDate(task.due_date);
        return !!date && date >= start && date <= end;
      };
    }
    case "month": {
      const now = new Date();
      const start = startOfMonth(now);
      const end = endOfMonth(now);
      return (task) => {
        const date = parseDate(task.due_date);
        return !!date && date >= start && date <= end;
      };
    }
    case "none":
      return (task) => !task.due_date;
    default:
      return null;
  }
}
