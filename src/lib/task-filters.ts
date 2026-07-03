import type { TaskFilters, TaskWithRelations } from "@/types";
import { isDueThisMonth, isDueThisWeek, isDueToday, isDueTomorrow, isOverdue } from "./dates";

export function matchesFilters(task: TaskWithRelations, filters: TaskFilters): boolean {
  if (filters.due !== "completed" && !filters.showCompleted && task.completed_at) return false;

  switch (filters.due) {
    case "completed":
      if (!task.completed_at) return false;
      break;
    case "overdue":
      if (!isOverdue(task.due_date, task.completed_at)) return false;
      break;
    case "today":
      if (!isDueToday(task.due_date)) return false;
      break;
    case "tomorrow":
      if (!isDueTomorrow(task.due_date)) return false;
      break;
    case "week":
      if (!isDueThisWeek(task.due_date)) return false;
      break;
    case "month":
      if (!isDueThisMonth(task.due_date)) return false;
      break;
    case "none":
      if (task.due_date) return false;
      break;
    default:
      break;
  }

  if (filters.priorities.length > 0 && !filters.priorities.includes(task.priority)) return false;

  if (filters.tagIds.length > 0) {
    const taskTagIds = new Set(task.tags.map((t) => t.id));
    if (!filters.tagIds.some((id) => taskTagIds.has(id))) return false;
  }

  if (filters.search.trim().length > 0) {
    const query = filters.search.trim().toLowerCase();
    const inTitle = task.title.toLowerCase().includes(query);
    const inDescription = task.description?.toLowerCase().includes(query) ?? false;
    const inTags = task.tags.some((t) => t.name.toLowerCase().includes(query));
    if (!inTitle && !inDescription && !inTags) return false;
  }

  return true;
}
