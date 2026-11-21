import { taskTitleSchema } from "@/features/tasks/schemas";

/** Most tasks a single multi-line paste may create. */
export const QUICK_ADD_MAX_LINES = 20;

export interface QuickAddParse {
  /** Trimmed, non-empty titles in input order. */
  titles: string[];
  /** True when more than `max` non-empty lines were supplied. */
  truncated: boolean;
  /** The first validation error (e.g. over-length), if any. */
  error: string | null;
}

/**
 * Turn composer input into task titles: one per non-empty line, trimmed,
 * capped at `max`. Each title is checked against the task form's title rule
 * so quick-add and the dialog accept exactly the same titles.
 */
export function parseQuickAddInput(text: string, max = QUICK_ADD_MAX_LINES): QuickAddParse {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const titles = lines.slice(0, max);
  let error: string | null = null;
  for (const title of titles) {
    const result = taskTitleSchema.safeParse(title);
    if (!result.success) {
      error = result.error.issues[0]?.message ?? "Invalid title";
      break;
    }
  }
  return { titles, truncated: lines.length > max, error };
}

/** Collapse a multi-line paste into one title (for "keep as one task"). */
export function joinLines(text: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ");
}

/** The position after the column's last task (positions may have gaps). */
export function nextPosition(tasks: { column_id: string; position: number }[], columnId: string) {
  return tasks.reduce(
    (max, t) => (t.column_id === columnId ? Math.max(max, t.position + 1) : max),
    0
  );
}

export const TEMP_TASK_PREFIX = "temp-";
export const isTempTask = (task: { id: string }) => task.id.startsWith(TEMP_TASK_PREFIX);
