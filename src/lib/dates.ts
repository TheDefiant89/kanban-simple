import { format, startOfDay } from "date-fns";

export function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isOverdue(dueDate: string | null, completedAt: string | null): boolean {
  const due = parseDate(dueDate);
  if (!due || completedAt) return false;
  return due < startOfDay(new Date());
}

export function formatDate(value: string | null, pattern = "MMM d, yyyy"): string {
  const date = parseDate(value);
  return date ? format(date, pattern) : "";
}
