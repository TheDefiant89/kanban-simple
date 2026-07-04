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
  reset: (projectId: string) => void;
}

export const useFilterStore = create<FilterState>((set, get) => ({
  filtersByProject: {},
  getFilters: (projectId) => get().filtersByProject[projectId] ?? emptyFilters,
  setDue: (projectId, due) =>
    set((s) => ({
      filtersByProject: {
        ...s.filtersByProject,
        [projectId]: { ...(s.filtersByProject[projectId] ?? emptyFilters), due },
      },
    })),
  setShowCompleted: (projectId, showCompleted) =>
    set((s) => ({
      filtersByProject: {
        ...s.filtersByProject,
        [projectId]: { ...(s.filtersByProject[projectId] ?? emptyFilters), showCompleted },
      },
    })),
  togglePriority: (projectId, priority) =>
    set((s) => {
      const current = s.filtersByProject[projectId] ?? emptyFilters;
      const priorities = current.priorities.includes(priority)
        ? current.priorities.filter((p) => p !== priority)
        : [...current.priorities, priority];
      return {
        filtersByProject: { ...s.filtersByProject, [projectId]: { ...current, priorities } },
      };
    }),
  toggleTag: (projectId, tagId) =>
    set((s) => {
      const current = s.filtersByProject[projectId] ?? emptyFilters;
      const tagIds = current.tagIds.includes(tagId)
        ? current.tagIds.filter((t) => t !== tagId)
        : [...current.tagIds, tagId];
      return { filtersByProject: { ...s.filtersByProject, [projectId]: { ...current, tagIds } } };
    }),
  setSearch: (projectId, search) =>
    set((s) => ({
      filtersByProject: {
        ...s.filtersByProject,
        [projectId]: { ...(s.filtersByProject[projectId] ?? emptyFilters), search },
      },
    })),
  reset: (projectId) =>
    set((s) => ({ filtersByProject: { ...s.filtersByProject, [projectId]: emptyFilters } })),
}));
