import { supabase } from "@/supabase/client";
import { listProjects } from "./projects";
import { listColumns } from "./columns";
import { listTasks } from "./tasks";
import { listTags } from "./tags";

function toCsv(rows: object[], columns: string[]): string {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const str = typeof value === "object" ? JSON.stringify(value) : String(value);
    // Guard against CSV/formula injection (CWE-1236): spreadsheet apps treat
    // a leading =, +, -, or @ as a formula trigger, so prefix it with a
    // single quote to force the cell to be read as plain text.
    const guarded = /^[=+\-@]/.test(str) ? `'${str}` : str;
    return /[",\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
  };
  const header = columns.join(",");
  const body = rows.map((row) =>
    columns.map((col) => escape((row as Record<string, unknown>)[col])).join(",")
  );
  return [header, ...body].join("\n");
}

function downloadFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const PROJECT_COLUMNS = [
  "id", "name", "description", "color", "is_archived", "created_at", "updated_at",
];
const COLUMN_COLUMNS = [
  "id", "project_id", "name", "color", "position", "is_collapsed", "created_at", "updated_at",
];
const TASK_COLUMNS = [
  "id", "project_id", "column_id", "title", "description", "position", "priority",
  "start_date", "due_date", "completed_at", "is_archived", "recurrence_type",
  "recurrence_cron", "recurrence_parent_id", "created_at", "updated_at",
];
const SUBTASK_COLUMNS = [
  "id", "task_id", "title", "is_completed", "position", "created_at", "updated_at",
];
const TAG_COLUMNS = ["id", "name", "color", "created_at", "updated_at"];

/**
 * Fetches every row the current user owns across all entity tables and
 * triggers one CSV download per table (projects, columns, tasks, subtasks,
 * tags), matching the schema in supabase/migrations exactly.
 */
export async function exportUserDataAsCsv(): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("Not authenticated");

  const projects = await listProjects(true);
  const tags = await listTags();

  const columnsByProject = await Promise.all(projects.map((p) => listColumns(p.id)));
  const tasksByProject = await Promise.all(projects.map((p) => listTasks(p.id, true)));

  const columns = columnsByProject.flat();
  const tasks = tasksByProject.flat();
  const subtasks = tasks.flatMap((t) => t.subtasks);

  const date = new Date().toISOString().slice(0, 10);
  downloadFile(`kanban-projects-${date}.csv`, toCsv(projects, PROJECT_COLUMNS), "text/csv");
  downloadFile(`kanban-columns-${date}.csv`, toCsv(columns, COLUMN_COLUMNS), "text/csv");
  downloadFile(`kanban-tasks-${date}.csv`, toCsv(tasks, TASK_COLUMNS), "text/csv");
  downloadFile(`kanban-subtasks-${date}.csv`, toCsv(subtasks, SUBTASK_COLUMNS), "text/csv");
  downloadFile(`kanban-tags-${date}.csv`, toCsv(tags, TAG_COLUMNS), "text/csv");
}
