# Production-Grade Review — Kanban. Simple.

**Scope:** every file in the repository (React app, services, stores, styles, build config, CI/CD, deployment).
**Stack:** Vite 6 · React 19 · TypeScript 5.7 · Tailwind 4 · Radix/shadcn · TanStack Query 5 · Supabase · dnd-kit · GitHub Pages.
**Method:** full source read + production build with sourcemap-based per-package bundle attribution.

## Measured bundle baseline (gzip)

| Chunk | Raw | Gzip | Main contents |
|---|---|---|---|
| `index` (entry) | 356.6 kB | 113.3 kB | **react-dom (525 kB src)**, tailwind-merge, sonner, radix menu/tooltip, floating-ui, zustand |
| `supabase` | 214.1 kB | 55.3 kB | auth-js, postgrest-js, **storage-js / realtime-js / functions-js / iceberg-js (unused)** |
| `vendor` | 50.1 kB | 17.7 kB | react-router, react (**react-dom missing — see BUNDLE-1**) |
| `dnd` | 50.3 kB | 16.7 kB | dnd-kit (Board only — correctly deferred) |
| `color-picker` (shared) | 53.6 kB | 16.2 kB | **date-fns (110 kB src)**, radix-select, radix-switch |
| `types` (shared) | 83.5 kB | 23.3 kB | zod, react-hook-form |
| `query` | 42.0 kB | 12.7 kB | TanStack Query |
| `Board` | 44.0 kB | 13.4 kB | app code + popover/checkbox |
| CSS | 37.6 kB | 7.1 kB | Tailwind output |

**Initial load (Dashboard route): ~250 kB gzip JS. Board route: ~280 kB gzip.**

---

# Findings

## CRITICAL

### CRIT-1 — Drag-reorder persists positions computed from *filtered* task lists (data corruption)

- **Severity:** Critical · **Category:** Correctness / React
- **Location:** `src/pages/Board.tsx` — `displayColumns` (L87–90) feeds `items`; `handleDragEnd` (L204–210) writes `position: i` from `col.tasks`

**Current implementation:** `items` mirrors `displayColumns`, which is the column list with tasks *filtered* by search/priority/tag/due filters. On drag end, every task in the affected column(s) is written back with `position = index` in that filtered array.

**Issue:** With any filter active (e.g. "hide completed" — the default is `showCompleted: false`!), hidden tasks are excluded from the reindex. Visible tasks get positions `0..k`, colliding with the untouched positions of hidden tasks. Subsequent `sort((a,b) => a.position - b.position)` interleaves hidden and visible tasks unpredictably; repeated drags compound the corruption. Since completed tasks are hidden by default, **this fires on essentially every board that has at least one completed task.**

**Recommended improvement:** Compute new positions against the full (unfiltered) task list of the column: splice the moved task out of the full list, re-insert it relative to its visible neighbour (the task it was dropped before/after), and reindex the full list. Alternatively, use fractional/sparse positions (e.g. midpoint between neighbours) so only the moved row is written — which also fixes NET-1.

**Expected benefit:** Eliminates silent board-order corruption; with sparse positions, reduces writes-per-drop from O(tasks-in-column) to 1.

---

## HIGH

### HIGH-1 — `useMemoSync` JSON-serializes the entire board on every render

- **Severity:** High · **Category:** Performance / React
- **Location:** `src/pages/Board.tsx:399–410` (`useMemoSync`), fed by `useBoardData` (`src/features/board/use-board.ts:46–51`)

**Current implementation:** On *every* Board render, `useMemoSync` runs `JSON.stringify(source)` over all columns, tasks, subtasks and tags to decide whether to `setItems`. The root cause is upstream: `useBoardData` rebuilds `columns` as a fresh array with a per-column `filter().sort()` over all tasks on every render (unmemoized, O(columns × tasks)), so reference equality is unusable and content hashing was used as a workaround.

**Issue:** Every keystroke in the board search box updates the zustand store → Board re-renders → full O(n) join + full serialization of the board. On a 500-task board with descriptions this is easily several ms of main-thread time *per keystroke*, on top of re-rendering all cards. This directly degrades INP. It also grows linearly with board size, i.e. it gets worse exactly where it matters.

**Recommended improvement:**
1. Memoize the join in `useBoardData` (single-pass `Map` group-by):
```ts
const columns = useMemo(() => {
  const byColumn = new Map<string, TaskWithRelations[]>();
  for (const t of tasksQuery.data ?? []) {
    (byColumn.get(t.column_id) ?? byColumn.set(t.column_id, []).get(t.column_id)!).push(t);
  }
  return (columnsQuery.data ?? []).map((c) => ({
    ...c,
    tasks: (byColumn.get(c.id) ?? []).sort((a, b) => a.position - b.position),
  }));
}, [columnsQuery.data, tasksQuery.data]);
```
2. With stable identities, `displayColumns` (already `useMemo`-ed) becomes referentially stable, and `useMemoSync` reduces to a reference check — delete `JSON.stringify` entirely:
```ts
if (prevRef.current !== displayColumns && !isDragging.current) {
  prevRef.current = displayColumns;
  setItems(displayColumns);
}
```

**Expected benefit:** Removes O(board size) serialization + O(C×T) join from every render. On large boards, per-keystroke render cost drops by an order of magnitude; INP under load improves measurably. (Verify with React DevTools Profiler.)

### HIGH-2 — Mutations fired inside a `setState` updater (double-fires under StrictMode)

- **Severity:** High · **Category:** React / Correctness
- **Location:** `src/pages/Board.tsx:171–179` and `186–213` (`handleDragEnd`)

**Current implementation:** `columnMutations.reorder.mutate(...)` and `taskMutations.reorder.mutate(...)` are called *inside* the `setItems(prev => ...)` updater functions.

**Issue:** State updater functions must be pure. React deliberately double-invokes them in development StrictMode (which this app enables in `main.tsx`), so every drag-drop in dev issues duplicate reorder request batches. It also couples network side effects to React's render scheduling — if React ever replays the updater (concurrent features), production duplicates become possible.

**Recommended improvement:** Compute the next state synchronously from `items` (it's in scope), call `setItems(next)` with the value, then call `mutate` after:
```ts
const next = computeReorder(items, activeId, overId);
setItems(next);
persistReorder(next, affectedColumnIds);
```

**Expected benefit:** Halves dev-mode write traffic, removes a latent correctness hazard, makes drag handlers testable.

### HIGH-3 — N+1 network writes for every reorder (one UPDATE per task/column)

- **Severity:** High · **Category:** Networking
- **Location:** `src/services/tasks.ts:119–130` (`reorderTasks`), `src/services/columns.ts:59–63` (`reorderColumns`), invoked from `Board.tsx:204–210`

**Current implementation:** `reorderTasks` issues one `UPDATE ... WHERE id = ?` HTTP request per task via `Promise.all`. `handleDragEnd` reindexes *every* task in up to two columns, so a cross-column drop on two 30-task columns fires ~60 HTTP requests. Errors are also silently swallowed for individual rows (`Promise.all` over Supabase builders never rejects — each result's `error` is ignored).

**Recommended improvement:** Single round trip via a Postgres RPC:
```sql
create function reorder_tasks(updates jsonb) returns void as $$
  update tasks t set position = (u->>'position')::int,
                    column_id = coalesce((u->>'column_id')::uuid, t.column_id)
  from jsonb_array_elements(updates) u
  where t.id = (u->>'id')::uuid and t.user_id = auth.uid();
$$ language sql security invoker;
```
…and `supabase.rpc("reorder_tasks", { updates })` client-side. Combined with sparse positions (CRIT-1) most drops become a single-row update. Also check per-row errors.

**Expected benefit:** ~60 requests → 1 per drop. On a cold HTTP/2 connection with ~100 ms RTT this removes seconds of aggregate network work, reduces Supabase rate-limit pressure, and makes failure handling atomic.

### HIGH-4 — `manualChunks` doesn't actually capture react-dom; the vendor split is broken

- **Severity:** High · **Category:** Bundle Size / Build
- **Location:** `vite.config.ts:20–25`; verified in build output

**Current implementation:** `manualChunks: { vendor: ["react", "react-dom", "react-router-dom"] }`. Sourcemap analysis shows the `vendor` chunk contains react-router + react but only 7.8 kB of react-dom; the **525 kB (source) react-dom implementation sits in the `index` chunk** because React 19's heavy code lives under the `react-dom/client` entry, which the array form does not match.

**Issue:** The app-code chunk (which changes every deploy) is fused with the largest, most stable dependency. Every deploy invalidates ~113 kB gzip instead of ~30 kB, defeating the entire point of the manual split.

**Recommended improvement:** Use the function form:
```ts
manualChunks(id) {
  if (!id.includes("node_modules")) return;
  if (/node_modules\/(react|react-dom|scheduler|react-router)/.test(id)) return "vendor";
  if (id.includes("@supabase")) return "supabase";
  if (id.includes("@tanstack")) return "query";
  if (id.includes("@dnd-kit")) return "dnd";
}
```

**Expected benefit:** Stable ~65 kB gzip vendor chunk that survives deploys; repeat-visit downloads shrink by ~80 kB gzip per deploy (within GitHub Pages' cache TTL). Verify with a rebuild + sourcemap check.

### HIGH-5 — Board load: duplicate project fetch + request waterfall

- **Severity:** High · **Category:** Networking
- **Location:** `src/pages/Board.tsx:57–61`, `src/features/board/use-board.ts:19–44`, `src/services/projects.ts:49–58`

**Current implementation:** Navigation to `/board/:slug` runs: (1) `getProjectBySlug(slug)` → returns the **full project row**; then (2) `getProject(projectId)` re-fetches the *same row by id*; plus (3) `listColumns` and (4) `listTasks`, all gated behind (1) by `enabled: !!projectId`.

**Issue:** One entirely redundant request per board visit, and a strict 2-hop waterfall (slug lookup → 3 parallel queries). On a ~100 ms RTT connection, board content is delayed ~200–300 ms beyond necessity, and the duplicate fetch adds server load for zero information.

**Recommended improvement:** Seed the project cache from the slug lookup and drop the second fetch:
```ts
const slugLookup = useQuery({
  queryKey: ["project-by-slug", slug],
  queryFn: async () => {
    const project = await getProjectBySlug(slug);
    queryClient.setQueryData(queryKeys.project(project.id), project);
    return project;
  },
});
```
Optionally collapse columns+tasks into one PostgREST nested select (`columns(*, tasks(...))`) for a single round trip, and prefetch board data on `ProjectTile` hover/focus via `queryClient.prefetchQuery`.

**Expected benefit:** −1 request per board view; board LCP improves by roughly one RTT (~100–300 ms); hover-prefetch makes dashboard→board navigation feel instant. (Confirm with the Network panel.)

### HIGH-6 — Whole-board re-render on every interaction; no memoized components

- **Severity:** High · **Category:** Rendering
- **Location:** `src/features/board/column.tsx` (`ColumnComponent`), `src/features/board/task-card.tsx` (`TaskCard`), callback props created inline in `Board.tsx:274–302`

**Current implementation:** Neither `ColumnComponent` nor `TaskCard` is memoized, and Board passes freshly-created arrow functions to every column on each render. Any state change (search keystroke, drag-over, dialog open/close, checkbox toggle) re-renders every column and every card. `useSortable` in each card makes reconciliation non-trivial per card.

**Issue:** Render cost scales with total task count instead of changed cards. During drag, `handleDragOver` also clones *every* column and its full task array per pointer-move event (`Board.tsx:146`), maximizing both render work and GC churn while the user is mid-gesture — the worst possible time.

**Recommended improvement:**
1. Wrap `TaskCard` and `ColumnComponent` in `React.memo`.
2. Hoist the handlers in Board with `useCallback`, keyed by arguments the children already pass (`task`, `column` are already parameters of the callbacks — change `onAddTask={() => ...}` style props to stable `onAddTask={(columnId) => ...}` handlers).
3. In `handleDragOver`, clone only the two affected columns; return other column objects untouched so memoized columns skip re-render.
4. Consider `useDeferredValue(filters.search)` (or a ~150 ms debounce in `BoardToolbar`) so typing never blocks on full-board filtering.

**Expected benefit:** Keystroke/drag re-renders drop from O(all tasks) to O(visible changed cards). This is the single biggest INP lever on large boards. (Profile before/after with React DevTools Profiler.)

---

## MEDIUM

### MED-1 — No optimistic updates: every small toggle does a full round trip + full board refetch

- **Severity:** Medium · **Category:** Networking / UX / React
- **Location:** `src/features/board/use-board.ts` — `useColumnMutations.update` (collapse toggle), `useTaskMutations.setCompleted`, `update`

**Current implementation:** Mutations call the server, then `invalidateQueries` — which refetches the *entire* task list with its nested `subtasks(*), task_tags(tag_id, tags(*))` join — before the UI reflects the change. Collapsing a column or ticking a checkbox visibly lags by a full RTT + refetch.

**Recommended improvement:** Use TanStack Query optimistic updates for the cheap, high-frequency mutations:
```ts
onMutate: async ({ task, completed }) => {
  await queryClient.cancelQueries({ queryKey: queryKeys.tasks(projectId) });
  const prev = queryClient.getQueryData(queryKeys.tasks(projectId));
  queryClient.setQueryData(queryKeys.tasks(projectId), (old: TaskWithRelations[] = []) =>
    old.map((t) => (t.id === task.id ? { ...t, completed_at: completed ? new Date().toISOString() : null } : t)));
  return { prev };
},
onError: (_e, _v, ctx) => queryClient.setQueryData(queryKeys.tasks(projectId), ctx?.prev),
onSettled: invalidate,
```
Apply the same to column collapse and task field edits (patch the cached row instead of refetching everything).

**Expected benefit:** Perceived latency for toggles goes from ~200–600 ms to ~0; board-wide refetch traffic per interaction drops from the full join payload to nothing (background revalidation only).

### MED-2 — Unused dependencies, dead files, dead code

- **Severity:** Medium · **Category:** Maintainability / Dependencies
- **Location:** `package.json`, `src/components/ui/tabs.tsx`, `src/components/ui/badge.tsx`, `src/lib/dates.ts`

**Findings (all verified by import graph):**
- `cmdk` — **zero imports anywhere.** Remove.
- `@radix-ui/react-toast` — zero imports (sonner is the toast system). Remove.
- `src/components/ui/tabs.tsx` — imported by nothing; its removal also frees `@radix-ui/react-tabs`.
- `src/components/ui/badge.tsx` — imported by nothing. Remove.
- `formatRelative` and `isFutureDate` in `src/lib/dates.ts` — never called. Remove (drops `formatDistanceToNow`/`isAfter` imports).
- `autoprefixer` in `postcss.config.js` — redundant with Tailwind v4 (`@tailwindcss/postcss` already runs Lightning CSS, which handles vendor prefixing). Remove the plugin and the devDependency.

**Expected benefit:** No shipped-bundle change (tree-shaking already excludes them) but faster `npm ci` in CI, smaller attack/audit surface, and no misleading "available" components. Zero risk.

### MED-3 — date-fns can be replaced by `Intl` + ~20 lines of native Date code

- **Severity:** Medium · **Category:** Bundle Size
- **Location:** `src/lib/dates.ts` (only consumer of date-fns); ships in the shared `color-picker` chunk (110 kB source, ~10–12 kB gzip after tree-shaking)

**Current implementation:** date-fns v4 is used solely for `format` (two fixed patterns), `isToday`/`isTomorrow`, week/month interval checks, and `isBefore`.

**Recommended improvement:** The two format patterns map directly to `Intl.DateTimeFormat` (`{ month: "short", day: "numeric" }` and `{ ...,"year": "numeric" }`, instantiated once at module scope); today/tomorrow/week/month checks are simple `Date` boundary comparisons. This removes the dependency entirely and gains locale-awareness for free.

**Expected benefit:** ~10–12 kB gzip off the Dashboard and Board load; one fewer dependency to maintain. Low risk — `dates.ts` is the single choke point.

### MED-4 — Per-task date computations repeated inside the filter hot loop

- **Severity:** Medium · **Category:** Performance
- **Location:** `src/lib/task-filters.ts` + `src/lib/dates.ts` (`isOverdue`, `isDueThisWeek`, …), called per task per render from `Board.tsx:88`

**Current implementation:** For every task on every filter evaluation, `isOverdue` recomputes `startOfDay(new Date())`, and week/month checks recompute `startOfWeek/endOfWeek/startOfMonth/endOfMonth`, plus `new Date(value)` parsing and `toLowerCase()` on the search query per task.

**Recommended improvement:** Restructure `matchesFilters` into `buildTaskPredicate(filters)` that computes boundaries and the lowercased query once, returning a closure applied per task. Combine with the memoization from HIGH-1 so it runs only when data/filters change.

**Expected benefit:** Filter pass drops from thousands of Date allocations to a handful per change; with HIGH-1/HIGH-6, keystroke filtering on a 1 000-task board stays comfortably under a frame.

### MED-5 — Dialog subtask creation and duplication use sequential awaits / N+1

- **Severity:** Medium · **Category:** Networking
- **Location:** `src/features/tasks/task-detail-dialog.tsx:256–258` (sequential `for…of await createSubtask`), `src/services/tasks.ts:137–182` (`duplicateTask`: `getTask` → insert → subtasks insert → `setTaskTags` (delete+insert) → `getTask` again)

**Recommended improvement:** Batch-insert subtasks in one call (`supabase.from("subtasks").insert(rows)`); in `duplicateTask`, drop the trailing `getTask` (the caller only invalidates anyway) and insert tags directly instead of the delete+insert `setTaskTags` path for a brand-new task.

**Expected benefit:** Creating a task with 10 subtasks: 11 sequential round trips → 2. Duplicate: 6+ round trips → 3.

### MED-6 — Dashboard stats fetch every task row for the user and filter O(projects × tasks)

- **Severity:** Medium · **Category:** Networking / Performance
- **Location:** `src/features/dashboard/use-projects.ts:16–36`, `src/services/tasks.ts:191–198`

**Current implementation:** `listTaskStatsForUser` pulls `project_id, due_date, completed_at` for *all* non-archived tasks, then the client runs `taskStats.filter(...)` three times per project.

**Recommended improvement:** Single-pass `Map<projectId, stats>` accumulation client-side (trivial), and longer term a Postgres view/RPC (`select project_id, count(*) ...group by project_id`) so payload stays O(projects) instead of O(tasks).

**Expected benefit:** Dashboard payload for a 2 000-task account drops from ~2 000 rows to ~N-projects rows; client aggregation goes O(P×T)→O(T).

### MED-7 — Keyboard users cannot open a task card (a11y)

- **Severity:** Medium · **Category:** Accessibility
- **Location:** `src/features/board/task-card.tsx:34–45`

**Current implementation:** The card is a `div` whose keyboard interaction is claimed by dnd-kit's `KeyboardSensor` (`{...attributes} {...listeners}`); `onClick` opens the detail dialog but Enter/Space initiate drag instead. There is no focusable element that opens the task.

**Recommended improvement:** Make the task title a real `<button>` (or add a visually-integrated "Open" button) that calls `onClick`, separate from the drag handle; keep dnd-kit's keyboard drag on the card container. Also add `aria-label` to the avatar menu trigger in `AppLayout.tsx:79` and to the two search inputs, and revisit 10 px tag-chip text on `${color}20` backgrounds for WCAG contrast.

**Expected benefit:** Core flow (viewing/editing a task) becomes keyboard- and screen-reader-operable; no performance cost.

### MED-8 — `uniqueSlugFor` / duplicate-name probing loops are unbounded N+1 queries

- **Severity:** Medium · **Category:** Networking
- **Location:** `src/services/projects.ts:12–33` and `139–151`

**Current implementation:** A `while (true)` loop issues one SELECT per candidate slug/name until a free one is found; a user with "Project", "Project-2"… "Project-9" pays 10 sequential round trips on create/rename. Also racy: two concurrent creates can both see a slug as free (the DB unique index saves integrity, but the user gets a raw error).

**Recommended improvement:** One query fetching all colliding slugs (`.like("slug", `${base}%`)`), pick the first free suffix locally; on unique-violation error, retry once with a fresh suffix.

**Expected benefit:** Create/rename becomes 1 query instead of N; removes a user-visible failure window.

### MED-9 — Missing `preconnect` to the Supabase origin

- **Severity:** Medium · **Category:** Networking / Core Web Vitals
- **Location:** `index.html`

**Current implementation:** The first Supabase call (session fetch → data queries) pays DNS + TCP + TLS after the JS bundle loads.

**Recommended improvement:** Vite substitutes `%VITE_*%` env vars in `index.html`:
```html
<link rel="preconnect" href="%VITE_SUPABASE_URL%" crossorigin />
```

**Expected benefit:** ~100–300 ms faster first data paint on cold loads (connection setup overlaps with JS download). Verify in the Network panel's connection timing.

### MED-10 — Supabase SDK ships storage/realtime/functions/iceberg code that is never used

- **Severity:** Medium · **Category:** Bundle Size
- **Location:** `supabase` chunk — 55.3 kB gzip, of which auth-js is ~40 % and storage-js + realtime-js + phoenix + functions-js + iceberg-js ≈ 45 % (all unused; only auth + postgrest are exercised)

**Issue:** `@supabase/supabase-js` v2 instantiates all sub-clients from one entry, so tree-shaking can't drop them.

**Recommended improvement:** Track upstream modular entry points; today you can compose `@supabase/auth-js` + `@supabase/postgrest-js` manually, but that trades ~25 kB gzip for meaningful maintenance risk — only worth it if initial-load budget becomes critical. Document as accepted cost otherwise.

**Expected benefit (if done):** ~20–25 kB gzip off the eager path.

---

## LOW

### LOW-1 — No route-chunk prefetching
**Category:** Performance · **Location:** `src/App.tsx:13–20`, `src/features/dashboard/project-tile.tsx`
All pages are lazy (good), but navigating Dashboard→Board always pays the `Board` + `dnd` chunk fetch (≈30 kB gzip). Warm it when idle after Dashboard renders (`requestIdleCallback(() => import("@/pages/Board"))`) or on tile hover/focus. Benefit: board navigation feels instant; near-zero cost.

### LOW-2 — GitHub Pages serving characteristics
**Category:** Deployment · **Location:** `.github/workflows/deploy.yml`, `public/404.html`, `index.html`
The deployment is largely exemplary: correct dynamic `VITE_BASE_PATH`, hash-allowlisted CSP meta, spa-github-pages redirect with `pathSegmentsToKeep` matching the base, hashed assets, SVG favicon, lint gate in CI. Remaining notes: (a) GitHub Pages serves everything with `Cache-Control: max-age=600` — you cannot extend it; the mitigation is exactly the stable-vendor-chunk fix in HIGH-4; (b) Pages already serves gzip/brotli — no action; (c) consider `concurrency.cancel-in-progress` (present ✓) and adding `npm run build`-time `tsc -b` (present ✓). Consider adding a `test` step when tests exist (none today — see Technical Debt).

### LOW-3 — `theme-color` meta doesn't track dark mode
**Category:** CSS/UX · **Location:** `index.html:7`
Static `#6366f1`. Add a second `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="...">` for correct browser chrome in dark mode.

### LOW-4 — `getFilters` lookup created per selector call
**Category:** React · **Location:** `src/pages/Board.tsx:67`, `src/store/filter-store.ts:25`
`useFilterStore((s) => s.getFilters(projectId))` works (stable references are returned), but subscribing to `s.filtersByProject[projectId] ?? emptyFilters` directly is more idiomatic and avoids the indirection through `get()` inside a selector.

### LOW-5 — `Settings.handleSignOut` lacks error handling
**Category:** Code Quality · **Location:** `src/pages/Settings.tsx:60–63`
`AppLayout`'s sign-out wraps in try/catch with a toast; Settings' does not — an offline sign-out throws an unhandled rejection. Extract one shared handler.

### LOW-6 — `useMemoSync` naming and render-phase `setState`
**Category:** Maintainability · **Location:** `src/pages/Board.tsx:399`
The hook neither memoizes nor syncs in the `useMemo` sense; render-phase `setState` is a supported React pattern but deserves the standard "derived state reset" shape and a clearer name (`useSyncedBoardItems`). Superseded by HIGH-1's rewrite.

### LOW-7 — `console.error` on missing env vars then guaranteed crash
**Category:** Code Quality · **Location:** `src/supabase/client.ts:7–13`
After logging, `createClient(undefined!, …)` throws an opaque error. Throw a descriptive `Error` instead (fail fast with the actionable message), or render a friendly config-error screen.

### LOW-8 — CSS is healthy
**Category:** CSS
Tailwind 4 output is 7.1 kB gzip; tokens via CSS variables, `oklch` palette, thin-scrollbar utility, and two small keyframe animations (transform/opacity only — compositor-friendly). `transition-shadow` on cards and `transition-all` on progress bars are cheap at these sizes. The only note: `* { @apply border-border outline-ring/50 }` is a universal selector applying two declarations — measurable only on very large DOMs; acceptable here. No action needed.

### LOW-9 — Security posture is strong; minor notes
**Category:** Security
Verified: no `dangerouslySetInnerHTML`; hash-based CSP (no `unsafe-inline` scripts); anon key exposure is by-design for Supabase with RLS migrations that were explicitly hardened (`20260705000000_harden_fk_ownership_rls.sql` etc.); CSV formula-injection guard in `export.ts`; password re-authentication gates account deletion and password change; reset-password flow gated on `PASSWORD_RECOVERY` events and the session is consumed after use. Notes: (a) `connect-src https://*.supabase.co` could be narrowed to the exact project host via `%VITE_SUPABASE_URL%`; (b) zod `.max()` caps exist for tasks/projects but tag and column names have no length cap client-side — add `.max()` to match DB constraints.

---

# Repository Summary

## Top 20 improvements ranked by real-world impact

1. **CRIT-1** Fix filtered-list position corruption on drag (correctness — before any perf work)
2. **HIGH-3** Single-RPC reorder (60→1 requests per drop)
3. **HIGH-6** `React.memo` cards/columns + stable callbacks + targeted drag-over cloning (INP)
4. **HIGH-1** Memoize board join; delete `JSON.stringify` sync (per-keystroke CPU)
5. **MED-1** Optimistic updates for complete/collapse/edit (perceived latency → ~0)
6. **HIGH-5** Kill duplicate project fetch; seed cache; hover-prefetch board data (LCP −1 RTT)
7. **HIGH-4** Fix `manualChunks` so react-dom actually lands in vendor (repeat-visit bytes)
8. **HIGH-2** Move mutations out of state updaters (correctness under StrictMode/concurrency)
9. **MED-9** `preconnect` to Supabase (cold-load −100–300 ms)
10. **MED-3** Replace date-fns with `Intl` (−10–12 kB gzip)
11. **MED-4** Hoist date boundaries out of the per-task filter loop
12. **LOW-1** Idle/hover prefetch of Board+dnd chunks
13. **MED-5** Batch subtask inserts; slim `duplicateTask`
14. **MED-6** Dashboard stats: Map aggregation now, server-side aggregate later
15. **MED-7** Keyboard access to task details + aria-labels
16. **MED-8** Slug uniqueness in one query
17. **MED-2** Remove unused deps/files/dead code
18. **MED-10** (Optional) modular Supabase composition (−20–25 kB gzip)
19. **LOW-3** Dark `theme-color` meta
20. **LOW-5/7** Error-handling polish (sign-out, env crash)

## Quick wins (<1 hour each)
- Remove `cmdk`, `@radix-ui/react-toast`, `@radix-ui/react-tabs`, `autoprefixer`; delete `tabs.tsx`, `badge.tsx`, `formatRelative`, `isFutureDate` (MED-2)
- Fix `manualChunks` function form (HIGH-4)
- Add Supabase `preconnect` (MED-9)
- Seed project cache from slug lookup; drop duplicate `getProject` (HIGH-5, first half)
- `React.memo` on `TaskCard`/`ColumnComponent` (HIGH-6, first half)
- Dark `theme-color`; avatar/search aria-labels; shared sign-out handler; descriptive env-var error

## Medium improvements (several hours)
- Memoized single-pass board join + reference-equality sync (HIGH-1)
- Optimistic updates for setCompleted / collapse / task edit (MED-1)
- Batch subtask insert, slim duplicate, one-query slug (MED-5, MED-8)
- Filter predicate factory + `useDeferredValue` search (MED-4, HIGH-6)
- date-fns → Intl (MED-3)
- Keyboard-accessible task open (MED-7)
- Board/dnd chunk prefetch (LOW-1)

## Major refactors
- **Drag-and-drop persistence layer:** sparse/fractional positions + `reorder_tasks` RPC + full-list reindex logic (CRIT-1, HIGH-2, HIGH-3 together). This is the one refactor that changes the data model; do it as a unit with migration + tests.
- **Server-side aggregation** for dashboard stats (Postgres view/RPC) once user data grows (MED-6).
- **Virtualized columns** (e.g. `@tanstack/react-virtual` inside each column's scroll area) — only if profiling shows >~200 visible cards per board; not justified today.

## Unnecessary dependencies
| Package | Verdict |
|---|---|
| `cmdk` | **Remove** — zero imports |
| `@radix-ui/react-toast` | **Remove** — superseded by sonner |
| `@radix-ui/react-tabs` | **Remove** with dead `tabs.tsx` |
| `autoprefixer` | **Remove** — redundant with Tailwind 4 / Lightning CSS |
| `date-fns` | **Replace** with `Intl` + native Date (MED-3) |
| everything else | Maintained, current-major, appropriately sized; keep |

## Modernisation opportunities
- React 19 idioms are already largely in place (no `forwardRef` legacy issues observed in shadcn components, lazy routes, StrictMode). Additions: `useDeferredValue` for search, `useOptimistic`-style patterns via TanStack Query's `onMutate`.
- Zod 3 → consider Zod 4 (`zod/v4` is notably smaller/faster) next time schemas are touched; the `types` chunk (23 kB gzip) would shrink.
- The zustand `getFilters` getter-in-store pattern → plain selector (LOW-4).
- `useForm` + `watch()` re-renders the whole dialog on watched-field changes; `useWatch`/`Controller` scoping is the modern pattern if the dialog ever grows.

## Technical debt (prioritised)
1. **No tests of any kind** — the drag-reorder logic (where the one real data-corruption bug lives) is exactly the code that needs unit tests. Add Vitest + a pure `computeReorder` function extracted from Board (enables HIGH-2 too), then component tests for filters.
2. **Positions as dense integers** — root cause of reorder write amplification and the filtered-reindex bug.
3. **Invalidate-everything cache strategy** — replace with targeted `setQueryData` patches (MED-1).
4. **Board.tsx at ~410 lines** doing DnD orchestration + dialogs + layout — extract `useBoardDnd()` hook and a `BoardDialogs` component.
5. Dead code and unused deps (MED-2) — trivial, do first.

---

# Final Assessment

| Area | Score |
|---|---|
| React Best Practices | 7/10 |
| Performance | 5/10 |
| Rendering Efficiency | 5/10 |
| Bundle Optimisation | 6/10 |
| Memory Efficiency | 7/10 |
| Architecture | 8/10 |
| Code Quality | 8/10 |
| Maintainability | 8/10 |
| Accessibility | 6/10 |
| Security | 9/10 |
| GitHub Pages Deployment | 9/10 |
| **Overall Production Readiness** | **7/10** |

**Overall grade: B**

A genuinely well-crafted codebase — clean feature-first architecture, disciplined TypeScript, exemplary GitHub Pages + CSP + RLS security posture — held back by a drag-reorder data-corruption bug, an unmemoized render hot path that serializes the whole board per keystroke, and chatty N+1 persistence.

## Prioritised optimisation roadmap (by ROI)

**Phase 1 — Correctness + free wins (1 day, low risk)**
CRIT-1 (unfiltered reindex) · HIGH-2 (mutations out of updaters) · MED-2 (dead deps/code) · HIGH-4 (manualChunks) · MED-9 (preconnect) · HIGH-5a (drop duplicate project fetch).

**Phase 2 — Interaction performance (1–2 days, low-medium risk)**
HIGH-1 (memoized join, delete JSON.stringify) · HIGH-6 (memo + stable callbacks + scoped drag-over cloning + deferred search) · MED-4 (filter predicate factory) · MED-1 (optimistic toggles).
*Hypotheses to confirm with React DevTools Profiler on a seeded 300–500-task board before/after: per-keystroke render time, drag-over frame cost.*

**Phase 3 — Network efficiency (2–3 days, medium risk — includes a migration)**
HIGH-3 + sparse positions (`reorder_tasks` RPC) · MED-5 (batch inserts) · MED-8 (one-query slugs) · LOW-1 (chunk prefetch) · HIGH-5b (nested board query / hover prefetch).

**Phase 4 — Polish and hedges (as capacity allows)**
MED-3 (drop date-fns) · MED-7 (a11y keyboard access) · MED-6 (server-side stats) · MED-10 (modular Supabase — only if budget demands) · virtualization (only if profiling justifies).

*Runtime-dependent recommendations (memoization payoffs, virtualization, deferred search) are hypotheses to validate with React DevTools Profiler and Lighthouse/INP field data before and after each phase; the bundle numbers above are measured, not estimated.*
