import { describe, it, expect } from "vitest";
import { buildTaskPredicate } from "@/lib/task-filters";
import type { TaskFilters, TaskWithRelations, Tag } from "@/types";

function tag(id: string, name: string): Tag {
  return { id, name } as unknown as Tag;
}

function task(overrides: Partial<TaskWithRelations>): TaskWithRelations {
  return {
    title: "Task",
    description: null,
    priority: "medium",
    completed_at: null,
    due_date: null,
    tags: [],
    ...overrides,
  } as unknown as TaskWithRelations;
}

const baseFilters: TaskFilters = {
  due: "all",
  showCompleted: false,
  priorities: [],
  tagIds: [],
  search: "",
};

describe("buildTaskPredicate", () => {
  it("hides completed tasks by default", () => {
    const matches = buildTaskPredicate(baseFilters);
    expect(matches(task({ completed_at: "2026-01-01T00:00:00Z" }))).toBe(false);
    expect(matches(task({ completed_at: null }))).toBe(true);
  });

  it("shows completed tasks when showCompleted is set", () => {
    const matches = buildTaskPredicate({ ...baseFilters, showCompleted: true });
    expect(matches(task({ completed_at: "2026-01-01T00:00:00Z" }))).toBe(true);
  });

  it("shows only completed tasks under the completed filter", () => {
    const matches = buildTaskPredicate({ ...baseFilters, due: "completed" });
    expect(matches(task({ completed_at: "2026-01-01T00:00:00Z" }))).toBe(true);
    expect(matches(task({ completed_at: null }))).toBe(false);
  });

  it("filters by priority", () => {
    const matches = buildTaskPredicate({ ...baseFilters, priorities: ["high", "critical"] });
    expect(matches(task({ priority: "high" }))).toBe(true);
    expect(matches(task({ priority: "low" }))).toBe(false);
  });

  it("filters by tag id (any match)", () => {
    const matches = buildTaskPredicate({ ...baseFilters, tagIds: ["t1"] });
    expect(matches(task({ tags: [tag("t1", "Bug")] }))).toBe(true);
    expect(matches(task({ tags: [tag("t2", "Chore")] }))).toBe(false);
  });

  it("matches search across title, description and tag names", () => {
    const matches = buildTaskPredicate({ ...baseFilters, search: "urgent" });
    expect(matches(task({ title: "Urgent fix" }))).toBe(true);
    expect(matches(task({ title: "x", description: "this is URGENT" }))).toBe(true);
    expect(matches(task({ title: "x", tags: [tag("t1", "Urgent")] }))).toBe(true);
    expect(matches(task({ title: "x", description: "nope" }))).toBe(false);
  });

  it("selects tasks with no due date under the 'none' filter", () => {
    const matches = buildTaskPredicate({ ...baseFilters, due: "none" });
    expect(matches(task({ due_date: null }))).toBe(true);
    expect(matches(task({ due_date: "2026-01-01" }))).toBe(false);
  });

  it("selects overdue, uncompleted tasks under the 'overdue' filter", () => {
    const matches = buildTaskPredicate({ ...baseFilters, due: "overdue" });
    expect(matches(task({ due_date: "2000-01-01" }))).toBe(true);
    expect(matches(task({ due_date: "2999-01-01" }))).toBe(false);
    expect(matches(task({ due_date: "2000-01-01", completed_at: "2000-01-02T00:00:00Z" }))).toBe(
      false
    );
  });
});
