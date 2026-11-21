import { describe, expect, it } from "vitest";
import { isTempTask, joinLines, nextPosition, parseQuickAddInput } from "./quick-add";

describe("parseQuickAddInput", () => {
  it("returns a single trimmed title", () => {
    expect(parseQuickAddInput("  Buy milk  ")).toEqual({
      titles: ["Buy milk"],
      truncated: false,
      error: null,
    });
  });

  it("returns nothing for blank input", () => {
    expect(parseQuickAddInput("   \n\t\n").titles).toEqual([]);
    expect(parseQuickAddInput("").titles).toEqual([]);
  });

  it("splits lines in order, skipping blanks, across line-ending styles", () => {
    expect(parseQuickAddInput("one\r\n\r\ntwo\rthree\n  \nfour").titles).toEqual([
      "one",
      "two",
      "three",
      "four",
    ]);
  });

  it("caps the number of lines and flags truncation", () => {
    const text = Array.from({ length: 25 }, (_, i) => `task ${i + 1}`).join("\n");
    const result = parseQuickAddInput(text);
    expect(result.titles).toHaveLength(20);
    expect(result.titles[19]).toBe("task 20");
    expect(result.truncated).toBe(true);
    expect(parseQuickAddInput("a\nb", 2).truncated).toBe(false);
  });

  it("reports over-length titles using the task form rule", () => {
    expect(parseQuickAddInput("x".repeat(200)).error).toBeNull();
    expect(parseQuickAddInput(`ok\n${"x".repeat(201)}`).error).toBe("Keep it under 200 characters");
  });
});

describe("joinLines", () => {
  it("joins non-empty lines with spaces", () => {
    expect(joinLines(" a \n\n b\r\nc ")).toBe("a b c");
  });
});

describe("nextPosition", () => {
  const tasks = [
    { column_id: "a", position: 0 },
    { column_id: "a", position: 4 },
    { column_id: "b", position: 9 },
  ];
  it("places after the column's last task, ignoring other columns and gaps", () => {
    expect(nextPosition(tasks, "a")).toBe(5);
    expect(nextPosition(tasks, "b")).toBe(10);
  });
  it("starts at 0 for an empty column", () => {
    expect(nextPosition(tasks, "c")).toBe(0);
  });
});

describe("isTempTask", () => {
  it("recognises optimistic placeholder ids", () => {
    expect(isTempTask({ id: "temp-123" })).toBe(true);
    expect(isTempTask({ id: "6f1c0d1e-0000-4000-8000-000000000000" })).toBe(false);
  });
});
