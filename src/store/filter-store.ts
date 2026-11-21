import { create } from "zustand";
import type { DueDateFilter, Priority, TaskFilters } from "@/types";

const emptyFilters: TaskFilters = {
  due: "all",
  showCompleted: false,
  priorities: [],
  tagIds: [],
  search: "",
};

interface FilterState {
  filtersByProject: Record<string, TaskFilters>;
  getFilters: (projectId: string) => TaskFilters;
  setDue: (projectId: string, due: DueDateFilter) => void;
  setShowCompleted: (projectId: string, show: boolean) => void;
  togglePriority: (projectId: string, priority: Priority) => void;
  toggleTag: (projectId: string, tagId: string) => void;
  setSearch: (projectId: string, search: string) => void;
}

/** `list` with `value` added, or removed if it was already there. */
function toggled<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export const useFilterStore = create<FilterState>((set, get) => {
  /** Merges `fn(current)` into one project's filters. */
  const patch = (projectId: string, fn: (current: TaskFilters) => Partial<TaskFilters>) =>
    set((s) => {
      const current = s.filtersByProject[projectId] ?? emptyFilters;
      return {
        filtersByProject: { ...s.filtersByProject, [projectId]: { ...current, ...fn(current) } },
      };
    });

  return {
    filtersByProject: {},
    getFilters: (projectId) => get().filtersByProject[projectId] ?? emptyFilters,
    setDue: (projectId, due) => patch(projectId, () => ({ due })),
    setShowCompleted: (projectId, showCompleted) => patch(projectId, () => ({ showCompleted })),
    togglePriority: (projectId, priority) =>
      patch(projectId, (c) => ({ priorities: toggled(c.priorities, priority) })),
    toggleTag: (projectId, tagId) => patch(projectId, (c) => ({ tagIds: toggled(c.tagIds, tagId) })),
    setSearch: (projectId, search) => patch(projectId, () => ({ search })),
  };
});
