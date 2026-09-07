import { describe, it, expect } from "vitest";
import { parseDate, formatDate, addDays, isOverdue } from "@/lib/dates";

describe("parseDate", () => {
  it("reads a date-only value as a local calendar day", () => {
    // The bug this guards against: new Date("2026-09-08") is UTC midnight,
    // which is the previous day in western timezones. parseDate must return
    // the local Sep 8 regardless of the machine's timezone.
    const d = parseDate("2026-09-08")!;
    expect(d).not.toBeNull();
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8); // 0-indexed September
    expect(d.getDate()).toBe(8);
  });

  it("returns null for empty or invalid input", () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate("")).toBeNull();
    expect(parseDate("not-a-date")).toBeNull();
  });

  it("parses full timestamps as an instant", () => {
    const d = parseDate("2026-09-08T12:30:00Z")!;
    expect(d.getTime()).toBe(Date.UTC(2026, 8, 8, 12, 30, 0));
  });
});

describe("formatDate", () => {
  it("round-trips a date-only value through yyyy-MM-dd", () => {
    expect(formatDate("2026-09-08", "yyyy-MM-dd")).toBe("2026-09-08");
    expect(formatDate("2026-01-05", "yyyy-MM-dd")).toBe("2026-01-05");
  });

  it("renders the short formats", () => {
    expect(formatDate("2026-01-05", "MMM d")).toBe("Jan 5");
    expect(formatDate("2026-01-05", "MMM d, yyyy")).toBe("Jan 5, 2026");
  });

  it("returns an empty string for null", () => {
    expect(formatDate(null)).toBe("");
  });
});

describe("addDays", () => {
  it("rolls over month boundaries", () => {
    const d = addDays(parseDate("2026-01-31")!, 1);
    expect(d.getMonth()).toBe(1); // February
    expect(d.getDate()).toBe(1);
  });

  it("goes backwards with a negative delta", () => {
    const d = addDays(parseDate("2026-03-01")!, -1);
    expect(d.getMonth()).toBe(1); // February
    expect(d.getDate()).toBe(28);
  });
});

describe("isOverdue", () => {
  it("flags a past due date that isn't completed", () => {
    expect(isOverdue("2000-01-01", null)).toBe(true);
  });

  it("does not flag a future due date", () => {
    expect(isOverdue("2999-01-01", null)).toBe(false);
  });

  it("never flags a completed task", () => {
    expect(isOverdue("2000-01-01", "2000-01-02T00:00:00Z")).toBe(false);
  });

  it("does not flag a task with no due date", () => {
    expect(isOverdue(null, null)).toBe(false);
  });
});
