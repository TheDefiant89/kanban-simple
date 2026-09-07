/**
 * Lightweight validation for the 5-field cron expressions used by custom
 * recurring tasks. This mirrors the grammar accepted by the `expand_cron_field`
 * / `next_cron_date` Postgres functions (see
 * `supabase/migrations/20260907000000_custom_cron_recurrence.sql`) so that a
 * pattern accepted here is one the recurrence engine can actually schedule.
 *
 * Fields are: minute hour day-of-month month day-of-week. Each field supports
 * a wildcard, single values, ranges (a-b), step syntax (with a slash) and
 * comma-separated lists of those. Tasks are date-based, so the minute/hour
 * fields are validated but do not affect which date an occurrence lands on.
 */

const FIELD_RANGES: [min: number, max: number][] = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 7], // day of week (0 and 7 are both Sunday)
];

function isValidPart(part: string, min: number, max: number): boolean {
  if (part === "") return false;

  let base = part;
  let step = 1;

  const slash = part.indexOf("/");
  if (slash !== -1) {
    const stepText = part.slice(slash + 1);
    if (!/^\d+$/.test(stepText)) return false;
    step = Number(stepText);
    if (step <= 0) return false;
    base = part.slice(0, slash);
  }

  let lo: number;
  let hi: number;

  if (base === "*") {
    lo = min;
    hi = max;
  } else if (base.includes("-")) {
    const [loText, hiText, ...rest] = base.split("-");
    if (rest.length > 0 || !/^\d+$/.test(loText) || !/^\d+$/.test(hiText)) return false;
    lo = Number(loText);
    hi = Number(hiText);
  } else {
    if (!/^\d+$/.test(base)) return false;
    lo = Number(base);
    // A bare number with a step (e.g. `5/2`) runs from that number to max.
    hi = step > 1 ? max : lo;
  }

  return lo >= min && hi <= max && lo <= hi;
}

function isValidField(field: string, min: number, max: number): boolean {
  return field.split(",").every((part) => isValidPart(part.trim(), min, max));
}

/** True when `expr` is a well-formed 5-field cron expression. */
export function isValidCronExpression(expr: string): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return fields.every((field, i) => isValidField(field, FIELD_RANGES[i][0], FIELD_RANGES[i][1]));
}
