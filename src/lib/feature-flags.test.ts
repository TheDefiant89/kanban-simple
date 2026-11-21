import { describe, expect, it } from "vitest";
import { parseFlagList, resolveEnabledFlags } from "./feature-flags";

describe("parseFlagList", () => {
  it("returns nothing for an unset or blank value", () => {
    expect(parseFlagList(undefined)).toEqual([]);
    expect(parseFlagList("")).toEqual([]);
    expect(parseFlagList(" , ")).toEqual([]);
  });

  it("splits on commas and whitespace, trimming and lowercasing", () => {
    expect(parseFlagList("bulk-edit, Dark-Mode-V2  calendar")).toEqual([
      "bulk-edit",
      "dark-mode-v2",
      "calendar",
    ]);
  });
});

describe("resolveEnabledFlags", () => {
  it("is empty while the database result is unknown", () => {
    expect(resolveEnabledFlags(undefined).size).toBe(0);
  });

  it("merges database flags with dev overrides, without duplicates", () => {
    const flags = resolveEnabledFlags(["bulk-edit"], ["bulk-edit", "calendar"]);
    expect([...flags].sort()).toEqual(["bulk-edit", "calendar"]);
  });
});
