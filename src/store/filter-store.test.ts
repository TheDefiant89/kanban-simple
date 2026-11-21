import { beforeEach, describe, it, expect } from "vitest";
import { useFilterStore } from "@/store/filter-store";

const store = () => useFilterStore.getState();

describe("filter store", () => {
  beforeEach(() => useFilterStore.setState({ filtersByProject: {} }));

  it("returns the same empty defaults for an untouched project", () => {
    expect(store().getFilters("p")).toBe(store().getFilters("q"));
    expect(store().getFilters("p")).toMatchObject({ due: "all", showCompleted: false, search: "" });
  });

  it("patches one field and keeps the rest", () => {
    store().setSearch("p", "bug");
    store().setDue("p", "today");
    expect(store().getFilters("p")).toMatchObject({ search: "bug", due: "today", priorities: [] });
  });

  it("toggles priorities and tags on and off", () => {
    store().togglePriority("p", "high");
    store().togglePriority("p", "low");
    store().togglePriority("p", "high");
    store().toggleTag("p", "t1");
    expect(store().getFilters("p").priorities).toEqual(["low"]);
    expect(store().getFilters("p").tagIds).toEqual(["t1"]);
  });

  it("keeps projects independent", () => {
    store().setShowCompleted("p", true);
    expect(store().getFilters("q").showCompleted).toBe(false);
  });
});
