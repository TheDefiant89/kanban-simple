# Kanban Feature Research — Trello as the Reference Application

_Generated 2026-11-21 by a scheduled research run. Competitor knowledge comes from the model's existing knowledge of the products. No live web research was done in this run, so verify details against current Trello docs before building._

## 1. Executive summary

This repository is a single-user, Supabase-backed Kanban app (React 19, TanStack Query, Zustand, dnd-kit, Zod). It already covers the core of Trello's free tier: projects, columns, drag-and-drop, tags, subtasks, due and start dates, priority, recurrence, filtering, per-column sorting, auto-archive and CSV export.

**Reference app: Trello.** It is the closest match for a simple, personal-scale board. Other tools (Jira, Linear, Asana, ClickUp, Monday, Notion, Azure DevOps, GitHub Projects) are mostly team- and sprint-oriented. Features like permissions, assignees, sprints and burndown add little for a single-user app.

Three features are recommended, in priority order:

1. **Inline quick-add** (Low complexity, high impact). Today every new task requires opening a dialog.
2. **Column WIP limits** (Low–Medium). This is the defining Kanban practice and it is missing.
3. **Task activity history** (Medium). The `activity_log` table already exists in the schema, but nothing in the UI reads or writes it.

## 2. Repository feature summary (observations)

| Area | Existing functionality |
|---|---|
| Auth | Sign up/in/out, email verification, forgot/reset/change password, rate-limited password verification, account deletion |
| Projects | Tiles with task/completed/overdue counts; search; sort; create, rename, duplicate, archive, delete; slugs |
| Columns | Default 5 columns; create, rename, recolor, collapse, delete, drag-reorder; **per-column sort** (custom, priority, due date, name, tag) |
| Tasks | Title, description, start/due/completed dates, priority, colored tags, subtasks with progress, duplicate, archive, delete, complete checkbox, drag across columns (optimistic) |
| Recurrence | None/daily/weekly/monthly/custom cron; the next occurrence is spawned by a Postgres trigger, including tag copy |
| Filtering | Due-date presets, multi-select priority and tags, text search (title, description, tags), show-completed toggle |
| Archive | Archived-tasks dialog; auto-archive of completed tasks (setting) |
| Settings | Tag manager, auto-archive, CSV export, theme (light/dark/system) |
| UX | Responsive layout, phone swipe columns with long-press drag, skeletons, empty states, toasts, FAB on mobile; Tab-focusable card checkboxes |
| Tests | Vitest unit tests for reorder, sort, filters, dates, cron, schemas |
| Unused | `activity_log` table (with RLS and length caps) exists; **no frontend code references it** |

## 3. Competitor comparison (Trello vs. this repo)

| Trello capability | In repo? | Notes |
|---|---|---|
| Boards, lists, cards, drag-and-drop | Yes | |
| Labels | Yes | Tags |
| Checklists | Yes | Subtasks |
| Due and start dates | Yes | |
| Card repeat | Yes | Recurrence |
| Filtering and search | Yes | |
| Archive | Yes | |
| Add card inline at the bottom of a list (type title, Enter, repeat) | **No** | Dialog only |
| Keyboard shortcuts (`n`, `/`, `f`, `e`, `c`, `d`, `q`) | **No** | Only Enter handlers in inputs |
| List WIP limits (Premium) | **No** | |
| Card activity feed | **No** | Table exists, UI missing |
| Card templates | No | |
| Card cover images and attachments | No | Needs Storage |
| Comments | No | |
| Members and assignees | No | Single-user app, not applicable |
| Butler automation, rules | No | High cost |
| Calendar, Timeline, Dashboard views | No | High cost |
| Custom fields | No | |
| Card dependencies | No | |
| Power-Up time tracking | No | |
| Card aging | No | |
| Board backgrounds | Partly | Theme only |
| Undo for delete or archive | No | |
| Permissions, sharing | No | Out of scope for a single-user app |

## 4. Gap analysis

Complexity is Low, Medium or High. Value is the expected benefit to a solo user.

| # | Gap | Value | Complexity | Fit with architecture | Decision |
|---|---|---|---|---|---|
| G1 | Inline quick-add card | High | Low | Excellent: reuses the create-task mutation in `use-board.ts` | **Recommend** |
| G2 | Column WIP limits | High | Low–Med | Good: one migration plus column dialog, mirrors the `sort_by` change | **Recommend** |
| G3 | Task activity history | Med–High | Medium | Good: table and RLS exist | **Recommend** |
| G4 | Keyboard shortcuts | Medium | Low–Med | Fine, but better after G1 | Deferred (follow-up) |
| G5 | Undo toast for archive and delete | Medium | Medium | Needs soft-delete semantics | Deferred |
| G6 | Card templates | Low–Med | Medium | Subtasks plus duplicate cover most of the need | Skipped |
| G7 | Attachments and covers | Medium | High | Storage, quotas, security | Skipped |
| G8 | Comments | Low | Medium | Single user, so little value | Skipped |
| G9 | Calendar/Timeline view | Medium | High | New routes and libraries | Skipped |
| G10 | Automation rules | Medium | High | Needs server-side engine | Skipped |
| G11 | Custom fields | Low–Med | High | Schema-heavy | Skipped |
| G12 | Dependencies | Low | High | Skipped | |
| G13 | Members, permissions | None | High | Contradicts the single-user model | Skipped |
| G14 | Burndown, reports | Low | Medium–High | Skipped | |

**Gaps identified: 14. Recommended: 3.**

## 5. Recommended features (priority order)

| Priority | Feature | Complexity | Expected user impact |
|---|---|---|---|
| 1 | Inline quick-add task composer | Low | High: removes the most frequent friction, since every capture currently takes a dialog round-trip, especially on phones |
| 2 | Column WIP limits | Low–Medium | High for Kanban practitioners: it enforces flow discipline and is the main Kanban feature the app lacks |
| 3 | Task activity history | Medium | Medium: trust and traceability, and it answers "when did I move or complete this?" |

---

## 6. Claude design prompts

### Prompt 1 — Inline quick-add task composer

```text
# Feature: Inline quick-add task composer (Trello-style "Add a card")

You are working in the `kanban-simple` repo (React 19 + TypeScript + Vite, Tailwind v4,
shadcn/ui, TanStack Query, Zustand, dnd-kit, Zod, Supabase). Follow existing conventions
in `src/features/board/*`, and read `column.tsx`, `use-board.ts`, `pages/Board.tsx` and
`features/tasks/schemas.ts` first.

## User problem
Adding a task currently opens the full task dialog (`onAddTask(columnId)` in `column.tsx`).
Capturing several quick items, especially on a phone, is slow.

## Goals
- Capture a task in one or two interactions: type a title, press Enter, type the next one.
- Keep the full dialog available for detailed creation.

## Functional requirements
1. The "Add task" button at the bottom of each column expands in place into a composer: a
   multi-line auto-growing textarea, an "Add" button and a Cancel (X) button.
2. Enter submits; Shift+Enter inserts a newline; Escape cancels and collapses; the composer
   stays open and focused after a successful submit so the user can keep adding.
3. Title validation reuses the title rule from `taskFormSchema` (trimmed, 1–200 chars). Do
   not create blank tasks. Show an inline error for over-length input.
4. New tasks append to the end of the column with default priority `medium`, and no dates
   or tags. If a column has a non-custom sort, the new task still takes the next free
   `position` (positions are unique; see migration `20261120010000_unique_task_positions`).
5. Creation is optimistic through the existing create-task mutation in `use-board.ts`, with
   a rollback and an error toast on failure. Do not bypass the existing position logic.
6. Pasting multi-line text offers creating one task per non-empty line (confirm if more
   than 1 line; cap at 20 lines per paste, with a toast if truncated).
7. Keep an "Add with details…" secondary affordance that opens the existing dialog,
   pre-filled with the typed title.
8. Collapsed columns do not show the composer.

## User stories
- As a user, I can type "Buy milk" and press Enter to add it without leaving the board.
- As a phone user, I can add many tasks without dialogs covering the board.
- As a user, I can press Escape to abandon an accidental open composer.

## UI/UX expectations
- The composer matches the card visuals (rounded-[11px], border, the existing `animate-pop`).
- The composer scrolls into view when opened at the bottom of a long column; the button
  area stays reachable on phones with safe-area insets and the soft keyboard.
- Only one composer is open at a time; opening another closes the first (keep a draft
  discarded).
- Do not trigger dnd-kit drags from the composer (stop pointer and key propagation as
  `task-card.tsx` does for the checkbox).

## Technical considerations
- Put the composer in a new `src/features/board/quick-add.tsx`; keep column state
  (`composerOpenColumnId`) in `Board.tsx` or local state, not Zustand, unless needed.
- Reuse `taskFormSchema.shape.title` rather than redefining the validation.
- If the add-task mutation currently requires the full form shape, add a thin
  `createQuickTask(columnId, title)` wrapper in `use-board.ts`.
- No database migration should be needed.

## Edge cases
- Rapid Enter presses (debounce while the mutation is in flight, but allow queued
  optimistic adds, preserving order).
- Network failure mid-sequence: failed items are removed and an error toast is shown;
  successful ones persist.
- Column deleted or collapsed while the composer is open.
- Filters hide the new task (for example a "today" filter is active): show a toast "Added
  — hidden by current filters".
- IME composition: Enter must not submit during composition (`e.nativeEvent.isComposing`).

## Accessibility
- The textarea has a visible or sr-only label, "New task title in {column name}".
- Focus moves into the textarea on open and back to the "Add task" button on cancel.
- Errors are announced via `aria-live="polite"`. All controls are keyboard operable and
  have at least a 44px touch target on phones.

## Acceptance criteria
- Clicking "Add task" shows the inline composer, not the dialog.
- Enter creates a task at the bottom of that column and keeps the composer focused.
- Escape and Cancel close the composer and discard the draft.
- Empty or whitespace input never creates a task.
- Multi-line paste creates the expected number of tasks, in order.
- Works on a 360px-wide viewport with the soft keyboard open.
- Unit tests cover title parsing and splitting (`quick-add.test.ts`); `npm run lint`, type
  check and tests pass.

## Suggested implementation approach
1. Extract the pure helper `parseQuickAddInput(text): string[]` with tests.
2. Build the `QuickAddComposer` component.
3. Swap the footer button in `column.tsx`; wire it to the mutation; keep the dialog path.
4. Manual QA on desktop and phone, including drag-and-drop after adding.

## Out of scope
Keyboard-shortcut bindings, assigning tags or dates inline, natural-language date parsing,
templates.
```

### Prompt 2 — Column WIP limits

```text
# Feature: Column WIP (work-in-progress) limits

Repo: `kanban-simple` (React 19, TS, Tailwind v4, shadcn/ui, TanStack Query, dnd-kit,
Zod, Supabase Postgres with RLS). Read `features/board/column.tsx`, `column-dialog.tsx`,
`use-board.ts`, `pages/Board.tsx`, `lib/sort-tasks.ts`, `types/database.ts`, and the
migration `20261120030000_column_sort.sql` (the pattern to mirror for a new column
attribute).

## User problem
Kanban's core discipline is limiting work in progress, but the board lets any column grow
without bound. Users cannot see when "In Progress" is overloaded.

## Goals
- Let users set an optional maximum number of active tasks per column.
- Make breaches visible without blocking the user's workflow unexpectedly.

## Functional requirements
1. Add a nullable `wip_limit integer` to `public.columns`, with
   `check (wip_limit is null or wip_limit between 1 and 999)`. New migration file, e.g.
   `2026XXXXXXXXXX_column_wip_limit.sql`, using the existing timestamp naming. RLS needs no
   change, but verify the update policy covers it. Update `src/types/database.ts` and the
   domain `Column` type.
2. The column create/edit dialog (`column-dialog.tsx`) gains an optional "WIP limit" number
   input, with Zod validation in `features/board/schemas.ts` (integer, 1–999, empty = no limit).
3. The column header shows the count of **countable tasks**: tasks that are not archived
   and not completed. It is shown as `3 / 5` when a limit exists, and as the plain count
   otherwise (preserve the current header format when no limit is set).
4. States, visible to colour-blind users: under the limit (normal), at the limit (amber
   with an icon/label), over the limit (red with an alert icon and a "Over limit by N"
   tooltip). Don't rely on colour alone.
5. The limit is **soft**: dropping or adding past the limit is allowed, but triggers a
   one-time toast per drop ("In Progress is over its WIP limit (6/5)"). A hard-block
   option is out of scope.
6. Counts honour the *unfiltered* data, so active search filters don't hide a breach.
7. The edit dialog also lets the user clear the limit.
8. CSV export includes no changes (optionally add a `wip_limit` column only if columns are
   exported; check `Settings.tsx`).

## User stories
- As a user, I set "In Progress" to 3 and see "2 / 3" in the header.
- As a user, when I drag a fourth task in, I see the header turn red and get a toast.
- As a user, I can remove the limit at any time.

## UI/UX expectations
- Header badge is compact and fits narrow phone columns (one column per screen); truncate
  the title before the badge.
- Collapsed columns still show the count and state.
- Reuse existing tokens and colours; check light and dark themes for contrast (4.5:1).

## Technical considerations
- Add a pure helper in `src/lib/wip.ts`: `getWipState(count, limit): "none" | "ok" |
  "at" | "over"`, plus tests (`wip.test.ts`) in the style of `sort-tasks.test.ts`.
- Count from the unfiltered column task list. Keep it memoised to avoid re-rendering all
  columns on every drag-over event.
- Mutations follow the existing optimistic column-update pattern in `use-board.ts`.
- Project duplication (`atomic_project_create_and_duplicate` RPC) must copy `wip_limit`.
  Update that function in the new migration with `create or replace`, and re-check its
  `search_path` hardening as the previous migrations do.
- The migration-drift CI check (`.github/workflows/migration-drift-check.yml`) must pass.

## Edge cases
- Tasks in a column currently exceeding a newly set limit: show the over state
  immediately; do not move tasks.
- Completing or archiving a task reduces the count (auto-archive included).
- Recurring tasks that spawn a new occurrence into a column can push it over: show the
  over state on next render without a toast.
- Limit set to a value below the current count; limit input blank; non-numeric, decimal
  or negative input rejected.
- Dragging within the same column does not trigger a toast.

## Accessibility
- The state is exposed as text: `aria-label="3 of 5 tasks, at limit"`.
- The toast uses the existing sonner live region.
- The number input has a label and a hint ("Leave empty for no limit"); error text is
  associated via `aria-describedby`.

## Acceptance criteria
- Migration applies cleanly and is idempotent where the existing migrations are.
- Setting, changing and clearing a limit persists across reloads.
- Header shows the correct count/limit and state for under, at and over.
- Dragging a task over the limit succeeds and shows exactly one toast.
- Completed and archived tasks are excluded from the count.
- Duplicated projects keep their limits.
- Unit tests for `getWipState`, plus a schema test for the limit; lint, type check, tests
  and the drift check pass.

## Suggested implementation approach
1. Migration + types. 2. Schema + dialog field. 3. `wip.ts` helper and tests. 4. Header
badge in `column.tsx`. 5. Toast on cross-column drop in `Board.tsx`'s drag-end handler.
6. Update README Features.

## Out of scope
Hard blocking, per-swimlane limits, limits by priority or tag, analytics on breaches.
```

### Prompt 3 — Task activity history

```text
# Feature: Task activity history (per-task timeline)

Repo: `kanban-simple` (React 19, TS, TanStack Query, Zod, Supabase with RLS). Read
`features/tasks/task-detail-dialog.tsx`, `features/board/use-board.ts`,
`types/database.ts` (the `activity_log` type), and the migrations
`20260703000000_initial_schema.sql`, `20260707000000_harden_activity_log_insert_rls.sql`
and `20260726000000_add_profile_activity_log_length_caps.sql`.

## User problem
Users can't see when a task was moved, completed, re-prioritised or rescheduled. A table
`activity_log (id, user_id, project_id, task_id, action, metadata jsonb, created_at)`
already exists with RLS, but nothing writes or displays it.

## Goals
- Record meaningful task events automatically.
- Show a read-only "Activity" timeline inside the task detail dialog.

## Functional requirements
1. **Recording (preferred: database triggers, not client code)** so every code path
   (drag-drop, recurrence, auto-archive, dialog edits) is captured consistently. Write a
   new migration with an `AFTER INSERT OR UPDATE` trigger on `public.tasks` that inserts
   into `activity_log` with `security definer`, a pinned `search_path`, and the same
   hardening as earlier migrations. Events:
   - `task.created`
   - `task.moved` (metadata: `from_column_id`, `to_column_id`, plus the column names at
     the time, so later renames or deletions don't break the history)
   - `task.completed` / `task.reopened`
   - `task.archived` / `task.unarchived`
   - `task.priority_changed` (`from`, `to`)
   - `task.due_date_changed` (`from`, `to`)
   - `task.renamed` (`from`, `to`, truncated to 200 chars)
   Do **not** log position-only changes (reordering within a column, or bulk reorder
   RPCs), and make sure a reorder RPC touching many rows produces no log rows.
2. Respect the length caps and RLS on `activity_log`. Triggers must populate `user_id`
   from the task's owner so the "own rows" policies pass.
3. Retention: keep the latest 200 events per task (prune in the trigger, or document why
   not). Rows cascade on task deletion (existing FK).
4. **Display:** a collapsible "Activity" section at the bottom of `task-detail-dialog.tsx`
   listing events newest first, with a friendly sentence ("Moved from Todo to In
   Progress"), a relative timestamp (date-fns `formatDistanceToNow`, full timestamp in a
   tooltip), and a lucide icon per event type. Fetch lazily when the section is opened,
   via a new `useTaskActivity(taskId)` TanStack Query hook (limit 50, "Load more").
5. Invalidate the activity query after task mutations that succeed.
6. Unknown `action` values render as a generic line rather than crashing (forward
   compatibility).

## User stories
- As a user, I open a task and see "Completed 2 days ago" and "Moved from Review to Done".
- As a user, I can tell when I last changed a due date.

## UI/UX expectations
- Matches the dialog's existing typography and spacing; compact list, with the section
  collapsed by default on phones.
- Loading skeleton and an empty state ("No activity yet").
- No editing or deleting of entries.

## Technical considerations
- Formatting lives in a pure `src/lib/activity.ts`: `describeActivity(entry): {icon,
  text}` with unit tests covering each action and the unknown fallback.
- Add Zod parsing of `metadata` in `features/tasks/schemas.ts` (or `lib/activity.ts`),
  and treat metadata as untrusted (render as text only; React escapes it by default; never
  `dangerouslySetInnerHTML`).
- The trigger must not break the recurrence trigger (`recurring_task` logic) or the
  auto-archive job. Test the ordering of triggers and ensure there is no recursive
  logging.
- Add an index on `(task_id, created_at desc)` if it doesn't exist.
- Backfill is not required; existing tasks start with an empty history.
- Verify performance on bulk updates (auto-archive of many tasks): the trigger must be
  set-based per row and cheap.

## Edge cases
- A task moved between columns that are later renamed or deleted: use the stored names.
- Multiple fields changed in one update produce multiple events with the same timestamp;
  order them deterministically (by `created_at`, then `id`).
- Duplicated tasks log `task.created` only.
- Recurrence spawns a new task: it logs `task.created` on the new task only.
- The activity query fails: show an inline error with retry, never block the dialog.
- Account deletion: cascade deletes must still succeed (test the
  `delete_account` RPC).

## Accessibility
- The list is a semantic `<ol>` with each entry's time in a `<time dateTime>` element.
- The collapsible uses a button with `aria-expanded` and `aria-controls`.
- Icons are decorative (`aria-hidden`); meaning is carried by text.

## Acceptance criteria
- Creating, moving, completing, archiving, re-prioritising, rescheduling and renaming
  each produce exactly one entry visible in the dialog.
- Within-column drag reorders produce none.
- RLS verified: another user cannot read the entries (add a note or SQL test).
- Account deletion, project duplication and recurrence still work.
- Unit tests for `describeActivity`; lint, type check, tests and the migration drift
  check pass.

## Suggested implementation approach
1. Migration (trigger, index, retention). 2. `lib/activity.ts` + tests.
3. `useTaskActivity` hook. 4. `ActivitySection` component in the task dialog.
5. Manual QA through all event types, plus a bulk auto-archive run.

## Out of scope
Project-level activity feed, undo/restore from history, comments, notifications, export
of activity.
```

## 7. Deferred and skipped ideas

- **Keyboard shortcuts (G4):** worthwhile next, once quick-add exists. Suggested bindings are `n` for new task, `/` for search and `?` for help.
- **Undo toast (G5):** needs a soft-delete design.
- **High-complexity or team-oriented features** (Calendar view, Butler-style automation, custom fields, dependencies, permissions): skipped because they are poor value for a simple personal board.
