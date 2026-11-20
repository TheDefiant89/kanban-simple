import { describe, it, expect } from "vitest";
import { fetchAllPages } from "@/lib/fetch-all";

function fakeTable(total: number, cap: number) {
  const rows = Array.from({ length: total }, (_, i) => i);
  const calls: [number, number][] = [];
  const buildPage = async (from: number, to: number) => {
    calls.push([from, to]);
    // Like PostgREST: honour the range but never return more than `cap` rows.
    return { data: rows.slice(from, Math.min(to + 1, from + cap)), error: null };
  };
  return { buildPage, calls };
}

describe("fetchAllPages", () => {
  it("returns every row when the table is larger than one page", async () => {
    const { buildPage, calls } = fakeTable(2345, 1000);
    const result = await fetchAllPages(buildPage, 1000);
    expect(result).toHaveLength(2345);
    expect(result[2344]).toBe(2344);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("makes one extra request when the total is an exact multiple of the page size", async () => {
    const { buildPage, calls } = fakeTable(2000, 1000);
    expect(await fetchAllPages(buildPage, 1000)).toHaveLength(2000);
    expect(calls).toHaveLength(3);
  });

  it("handles an empty result and null data", async () => {
    expect(await fetchAllPages(async () => ({ data: null, error: null }))).toEqual([]);
  });

  it("throws the query error", async () => {
    const err = new Error("boom");
    await expect(fetchAllPages(async () => ({ data: null, error: err }))).rejects.toBe(err);
  });
});
