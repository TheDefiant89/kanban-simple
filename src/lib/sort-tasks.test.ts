import { describe, it, expect } from "vitest";
import { sortTasks } from "@/lib/sort-tasks";
import type { Priority, TaskWithRelations } from "@/types";

let n = 0;
function task(
  title: string,
  opts: { priority?: Priority; due?: string | null; tags?: string[]; position?: number } = {}
): TaskWithRelations {
  n += 1;
  return {
    id: `t${String(n).padStart(3, "0")}`,
    title,
    priority: opts.priority ?? "medium",
    due_date: opts.due ?? null,
    position: opts.position ?? n,
    tags: (opts.tags ?? []).map((name) => ({ id: name, name })),
  } as unknown as TaskWithRelations;
}

const titles = (tasks: TaskWithRelations[]) => tasks.map((t) => t.title);

describe("sortTasks", () => {
  it("custom keeps the stored position order", () => {
    const a = task("a", { position: 2 });
    const b = task("b", { position: 0 });
    const c = task("c", { position: 1 });
    expect(titles(sortTasks([a, b, c], "custom"))).toEqual(["b", "c", "a"]);
  });

  it("priority puts critical first and keeps custom order for ties", () => {
    const tasks = [
      task("low", { priority: "low", position: 0 }),
      task("med-2", { priority: "medium", position: 1 }),
      task("crit", { priority: "critical", position: 2 }),
      task("med-1", { priority: "medium", position: 0.5 }),
      task("high", { priority: "high", position: 3 }),
    ];
    expect(titles(sortTasks(tasks, "priority"))).toEqual(["crit", "high", "med-1", "med-2", "low"]);
  });

  it("due date is soonest first with undated tasks last", () => {
    const tasks = [
      task("none"),
      task("dec", { due: "2026-12-01" }),
      task("nov", { due: "2026-11-20" }),
      task("jan", { due: "2027-01-05" }),
    ];
    expect(titles(sortTasks(tasks, "due_date"))).toEqual(["nov", "dec", "jan", "none"]);
  });

  it("name is case-insensitive and numeric-aware", () => {
    const tasks = [task("task 10"), task("Banana"), task("task 2"), task("apple")];
    expect(titles(sortTasks(tasks, "name"))).toEqual(["apple", "Banana", "task 2", "task 10"]);
  });

  it("tag sorts by each task's alphabetically first tag, untagged last", () => {
    const tasks = [
      task("untagged"),
      task("zeta+alpha", { tags: ["zeta", "alpha"] }),
      task("beta", { tags: ["beta"] }),
      task("Alpha-cap", { tags: ["Alpha"], position: 99 }),
    ];
    // "alpha" and "Alpha" tie (case-insensitive) -> custom order decides.
    expect(titles(sortTasks(tasks, "tag"))).toEqual(["zeta+alpha", "Alpha-cap", "beta", "untagged"]);
  });

  it("does not mutate the input", () => {
    const tasks = [task("b"), task("a")];
    const copy = [...tasks];
    sortTasks(tasks, "name");
    expect(tasks).toEqual(copy);
  });
});
