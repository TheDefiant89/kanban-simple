import {
  format,
  formatDistanceToNow,
  isAfter,
  isBefore,
  isToday,
  isTomorrow,
  isWithinInterval,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isOverdue(dueDate: string | null, completedAt: string | null): boolean {
  const due = parseDate(dueDate);
  if (!due || completedAt) return false;
  return isBefore(due, startOfDay(new Date()));
}

export function isDueToday(dueDate: string | null): boolean {
  const due = parseDate(dueDate);
  return due ? isToday(due) : false;
}

export function isDueTomorrow(dueDate: string | null): boolean {
  const due = parseDate(dueDate);
  return due ? isTomorrow(due) : false;
}

export function isDueThisWeek(dueDate: string | null): boolean {
  const due = parseDate(dueDate);
  if (!due) return false;
  const now = new Date();
  return isWithinInterval(due, {
    start: startOfWeek(now, { weekStartsOn: 1 }),
    end: endOfWeek(now, { weekStartsOn: 1 }),
  });
}

export function isDueThisMonth(dueDate: string | null): boolean {
  const due = parseDate(dueDate);
  if (!due) return false;
  const now = new Date();
  return isWithinInterval(due, { start: startOfMonth(now), end: endOfMonth(now) });
}

export function formatDate(value: string | null, pattern = "MMM d, yyyy"): string {
  const date = parseDate(value);
  return date ? format(date, pattern) : "";
}

export function formatRelative(value: string | null): string {
  const date = parseDate(value);
  return date ? formatDistanceToNow(date, { addSuffix: true }) : "";
}

export function isFutureDate(value: string | null): boolean {
  const date = parseDate(value);
  return date ? isAfter(date, new Date()) : false;
}
