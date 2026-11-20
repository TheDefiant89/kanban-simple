/**
 * PostgREST caps every response at the project's max-rows setting (1000 by
 * default on Supabase) and silently truncates anything beyond it, so a plain
 * `select` on a large table quietly drops rows. This pages through the full
 * result with `.range()` until a short page comes back.
 *
 * `buildPage(from, to)` must return a fresh query for that inclusive row
 * range, ordered by a unique key (or ending in one as a tie-breaker), so rows
 * can't shift between pages and be skipped or repeated.
 */
export const PAGE_SIZE = 1000;

export async function fetchAllPages<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = PAGE_SIZE
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
