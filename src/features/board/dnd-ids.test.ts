import { describe, it, expect } from "vitest";
import { columnIdFromDropzone, dropzoneId } from "@/features/board/dnd-ids";

describe("dropzone ids", () => {
  it("round-trips a column id", () => {
    expect(columnIdFromDropzone(dropzoneId("col-1"))).toBe("col-1");
  });

  it("returns null for task and column ids", () => {
    expect(columnIdFromDropzone("col-1")).toBeNull();
    expect(columnIdFromDropzone("3f2a")).toBeNull();
  });
});
