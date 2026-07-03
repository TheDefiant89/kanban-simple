import type { Column, Priority, Project, RecurrenceType, Subtask, Tag, Task } from "./database";

export type {
  Priority,
  RecurrenceType,
  Profile,
  Project,
  Column,
  Task,
  Subtask,
  Tag,
  TaskTag,
  ActivityLogEntry,
} from "./database";

/** A task hydrated with its subtasks and tags for UI consumption. */
export interface TaskWithRelations extends Task {
  subtasks: Subtask[];
  tags: Tag[];
}

/** A column hydrated with its tasks, as rendered on the board. */
export interface ColumnWithTasks extends Column {
  tasks: TaskWithRelations[];
}

/** A project tile with aggregate stats computed for the dashboard. */
export interface ProjectWithStats extends Project {
  taskCount: number;
  completedCount: number;
  overdueCount: number;
}

export type ProjectSortKey = "name" | "created" | "updated";

export type DueDateFilter =
  "all" | "overdue" | "today" | "tomorrow" | "week" | "month" | "none" | "completed";

export interface TaskFilters {
  due: DueDateFilter;
  showCompleted: boolean;
  priorities: Priority[];
  tagIds: string[];
  search: string;
}

export const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];
export const RECURRENCE_TYPES: RecurrenceType[] = ["none", "daily", "weekly", "monthly", "custom"];

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  low: "#64748b",
  medium: "#3b82f6",
  high: "#f59e0b",
  critical: "#ef4444",
};

export const DEFAULT_COLUMNS: { name: string; color: string }[] = [
  { name: "Backlog", color: "#94a3b8" },
  { name: "Todo", color: "#3b82f6" },
  { name: "In Progress", color: "#f59e0b" },
  { name: "Review", color: "#a855f7" },
  { name: "Done", color: "#22c55e" },
];

export const PROJECT_COLORS: string[] = [
  "#6366f1",
  "#3b82f6",
  "#0ea5e9",
  "#14b8a6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#a855f7",
  "#64748b",
];
