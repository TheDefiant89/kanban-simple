import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { patchOptimistically, rollback } from "@/lib/query-client";

describe("patchOptimistically / rollback", () => {
  it("applies the patch and restores the snapshot on rollback", async () => {
    const client = new QueryClient();
    client.setQueryData(["k"], [1, 2]);
    const context = await patchOptimistically<number[]>(client, ["k"], (old) => [...old, 3]);
    expect(client.getQueryData(["k"])).toEqual([1, 2, 3]);
    rollback(client, ["k"], context);
    expect(client.getQueryData(["k"])).toEqual([1, 2]);
  });

  it("leaves an empty cache empty", async () => {
    const client = new QueryClient();
    const context = await patchOptimistically<number[]>(client, ["k"], () => [1]);
    expect(client.getQueryData(["k"])).toBeUndefined();
    rollback(client, ["k"], context);
    expect(client.getQueryData(["k"])).toBeUndefined();
  });

  it("restores a cached null (a valid value, e.g. auto-archive off)", async () => {
    const client = new QueryClient();
    client.setQueryData<number | null>(["k"], null);
    const context = await patchOptimistically<number | null>(client, ["k"], () => 7);
    expect(client.getQueryData(["k"])).toBe(7);
    rollback(client, ["k"], context);
    expect(client.getQueryData(["k"])).toBeNull();
  });
});
