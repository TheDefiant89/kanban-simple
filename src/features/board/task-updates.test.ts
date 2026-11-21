import { describe, it, expect } from "vitest";
import { diffTags, spawnsNextOccurrence } from "@/features/board/task-updates";
import type { Tag, Task, TaskWithRelations } from "@/types";

const tag = (id: string) => ({ id }) as Tag;
const before = (fields: Partial<TaskWithRelations>) => fields as TaskWithRelations;
const row = (fields: Partial<Task>) => fields as Task;

describe("spawnsNextOccurrence", () => {
  it("is true when a recurring task goes from open to completed", () => {
    expect(
      spawnsNextOccurrence(
        before({ completed_at: null }),
        row({ completed_at: "2026-11-21T10:00:00Z", recurrence_type: "weekly" })
      )
    ).toBe(true);
  });

  it("is false for a non-recurring task", () => {
    expect(
      spawnsNextOccurrence(
        before({ completed_at: null }),
        row({ completed_at: "2026-11-21T10:00:00Z", recurrence_type: "none" })
      )
    ).toBe(false);
  });

  it("is false when the task was already completed or is being reopened", () => {
    const done = "2026-11-20T10:00:00Z";
    expect(
      spawnsNextOccurrence(
        before({ completed_at: done }),
        row({ completed_at: done, recurrence_type: "daily" })
      )
    ).toBe(false);
    expect(
      spawnsNextOccurrence(
        before({ completed_at: done }),
        row({ completed_at: null, recurrence_type: "daily" })
      )
    ).toBe(false);
  });
});

describe("diffTags", () => {
  it("returns only the links to add and remove", () => {
    expect(diffTags([tag("a"), tag("b")], ["b", "c"])).toEqual({ add: ["c"], remove: ["a"] });
  });

  it("is empty when the tag set is unchanged, regardless of order", () => {
    expect(diffTags([tag("a"), tag("b")], ["b", "a"])).toEqual({ add: [], remove: [] });
  });

  it("ignores duplicate ids", () => {
    expect(diffTags([], ["a", "a"])).toEqual({ add: ["a"], remove: [] });
  });
});
