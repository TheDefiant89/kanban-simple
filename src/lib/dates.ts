// Native Date/Intl helpers — the app only ever needs two display formats,
// a date-input format and simple local-calendar-day boundaries, so date-fns
// was replaced with ~40 lines of platform code (≈10 kB gzip saved).

const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export type DateFormat = "MMM d, yyyy" | "MMM d" | "yyyy-MM-dd";

export function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Midnight at the start of the current local day. */
export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Midnight `days` local calendar days after `date` (DST-safe). */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function isOverdue(dueDate: string | null, completedAt: string | null): boolean {
  const due = parseDate(dueDate);
  if (!due || completedAt) return false;
  return due < startOfToday();
}

export function formatDate(value: string | null, pattern: DateFormat = "MMM d, yyyy"): string {
  const date = parseDate(value);
  if (!date) return "";
  switch (pattern) {
    case "MMM d":
      return MONTH_DAY.format(date);
    case "yyyy-MM-dd": {
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${date.getFullYear()}-${month}-${day}`;
    }
    default:
      return MONTH_DAY_YEAR.format(date);
  }
}
