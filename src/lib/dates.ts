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

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDate(value: string | null): Date | null {
  if (!value) return null;
  // Date-only values (the `date` columns start_date / due_date) must be read
  // as a local calendar day. `new Date("2026-09-08")` parses as UTC midnight,
  // which falls on the previous day in any negative-UTC-offset timezone —
  // shifting displayed due dates, the overdue flag and every date filter back
  // by a day. Full timestamps (completed_at / created_at / updated_at) keep
  // their timezone-aware parse so they render at the correct local instant.
  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
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
