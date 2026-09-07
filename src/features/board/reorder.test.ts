import { describe, it, expect } from "vitest";
import { mergeVisibleOrder, buildPositionUpdates } from "@/features/board/reorder";
import type { TaskWithRelations } from "@/types";

// Minimal task factory — mergeVisibleOrder / buildPositionUpdates only read
// id, position and column_id.
function task(id: string, position: number, columnId = "col"): TaskWithRelations {
  return { id, position, column_id: columnId } as unknown as TaskWithRelations;
}

describe("mergeVisibleOrder", () => {
  it("keeps a hidden task anchored to the visible task before it when reordering", () => {
    const a = task("a", 0);
    const hidden = task("hidden", 1);
    const c = task("c", 2);
    const full = [a, hidden, c];

    // Visible list is [a, c] (hidden filtered out), reordered to [c, a].
    const merged = mergeVisibleOrder(full, [c, a], "c");

    // `hidden` stays after `a`, its original anchor.
    expect(merged.map((t) => t.id)).toEqual(["c", "a", "hidden"]);
  });

  it("re-anchors trailing hidden tasks when the moved task leaves the column", () => {
    const a = task("a", 0);
    const hidden = task("hidden", 1);
    const c = task("c", 2);
    const full = [a, hidden, c];

    // `c` left this column, so the remaining visible list is just [a].
    const merged = mergeVisibleOrder(full, [a], "c");

    expect(merged.map((t) => t.id)).toEqual(["a", "hidden"]);
  });

  it("is a no-op when the visible order is unchanged", () => {
    const a = task("a", 0);
    const b = task("b", 1);
    const merged = mergeVisibleOrder([a, b], [a, b], "a");
    expect(merged.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("buildPositionUpdates", () => {
  it("emits updates only for tasks whose position or column changed", () => {
    const previous = new Map([
      ["a", task("a", 0)],
      ["b", task("b", 1)],
      ["c", task("c", 2)],
    ]);
    // New order swaps a and c; b stays at index 1.
    const merged = [task("c", 2), task("b", 1), task("a", 0)];

    const updates = buildPositionUpdates(merged, "col", previous);

    expect(updates).toEqual([
      { id: "c", position: 0, column_id: "col" },
      { id: "a", position: 2, column_id: "col" },
    ]);
  });

  it("emits an update when a task moves to a new column", () => {
    const previous = new Map([["a", task("a", 0, "col-1")]]);
    const merged = [task("a", 0, "col-1")];

    const updates = buildPositionUpdates(merged, "col-2", previous);

    expect(updates).toEqual([{ id: "a", position: 0, column_id: "col-2" }]);
  });
});
