# Kanban

A fast, modern Kanban board application — built with React 19, TypeScript, Vite and
Tailwind CSS on the frontend, and Supabase (Postgres, Auth, Row Level Security) as the
only backend. The app compiles to static files and deploys directly to GitHub Pages;
there is no server to run or maintain after deployment.

Projects, boards, columns, tasks, subtasks, tags, filtering/search, drag-and-drop
reordering, a lightweight recurring-task engine, CSV export and account deletion are
all included. See [Features](#features) below for the full list.

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui (Radix primitives)
- **Routing:** React Router 7
- **Data/state:** TanStack Query (server state) + Zustand (UI state: theme, filters)
- **Drag and drop:** dnd-kit
- **Forms & validation:** React Hook Form + Zod
- **Dates:** date-fns
- **Backend:** Supabase — Postgres, Auth, Row Level Security, Storage (future-ready)

## Features

- **Auth:** sign up, sign in, sign out, email verification, forgot/reset password,
  change password, persistent sessions. Every table is protected by Row Level Security
  so a user can only ever see their own data.
- **Dashboard:** unlimited projects shown as tiles with task/completed/overdue counts,
  search, sort (name / created / recently updated), create/rename/duplicate/archive/delete.
- **Board:** default columns (Backlog, Todo, In Progress, Review, Done), plus create,
  rename, recolor, collapse, delete and drag-to-reorder columns.
- **Tasks:** title, description, start/due/completion dates, priority (Low → Critical),
  multiple custom coloured tags, unlimited subtasks with progress ("4 / 10 completed"),
  create/edit/duplicate/archive/delete, drag-and-drop within and across columns with
  optimistic updates persisted immediately to Supabase.
- **Recurring tasks:** None / Daily / Weekly / Monthly / Custom (cron string, stored for
  a future scheduler). Completing a recurring task keeps its own completion record and
  spawns the next occurrence automatically via a Postgres trigger — see
  [Recurring tasks](#recurring-tasks) below.
- **Filtering & search:** All / Overdue / Today / Tomorrow / This Week / This Month /
  No Due Date / Completed, multi-select priority filter, multi-select tag filter, and
  live search across title, description and tags. Completed tasks are hidden by default.
- **Settings:** view email, change password, sign out, export all data as CSV, delete
  account (with confirmation).
- **UI:** responsive (mobile/tablet/desktop), light/dark/system theme, loading
  skeletons, empty states, toast notifications, sticky nav, floating action button on
  mobile.

## Project structure

```
src/
  components/ui/       shadcn/ui primitives (button, dialog, select, ...)
  components/shared/   small reusable pieces (empty state, color picker, priority badge)
  features/            feature modules (auth, dashboard, board, tasks) — hooks + UI
  pages/               route-level page components
  layouts/              AppLayout, AuthLayout, route guards
  services/              Supabase query/mutation functions, one file per entity
  store/                 Zustand stores (theme, filters)
  supabase/              Supabase client
  types/                 database + domain TypeScript types
  lib/                    utils, date helpers, filter matching, query client
supabase/
  migrations/             SQL schema, RLS policies, recurrence engine, account deletion RPC
.github/workflows/        GitHub Actions deploy workflow
```

## Getting started

### 1. Create a Supabase project

Create a project at [supabase.com](https://supabase.com), then run the SQL migrations in
`supabase/migrations/` against it, in order — either via the Supabase SQL editor (paste
each file's contents and run) or with the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

This creates all tables, indexes, RLS policies, the `profiles` auto-provisioning
trigger, the recurring-task trigger, and the `delete_own_account` RPC used by the
Settings page.

In the Supabase dashboard, under **Authentication → URL Configuration**, add your local
dev URL (e.g. `http://localhost:5173/kanban-simple/`) and your GitHub Pages URL (e.g.
`https://<user>.github.io/kanban-simple/`) as allowed redirect URLs — these are used for
email verification and password reset links.

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your Supabase project's
**Settings → API** page.

### 3. Install and run

```bash
npm install
npm run dev
```

The app runs at `http://localhost:5173/kanban-simple/` (the `/kanban-simple/` base path
matches the production GitHub Pages path — see below).

### 4. Build

```bash
npm run build
npm run preview
```

## Deployment (GitHub Pages)

This repo ships a GitHub Actions workflow (`.github/workflows/deploy.yml`) that builds
and deploys the app to GitHub Pages on every push to `main`.

1. In your repository, go to **Settings → Pages** and set **Source** to
   **GitHub Actions**.
2. Add two repository secrets under **Settings → Secrets and variables → Actions**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Push to `main`. The workflow installs dependencies, lints, builds with
   `VITE_BASE_PATH` set to `/<repo-name>/`, and deploys the `dist/` output.

Because the Supabase anon key is designed to be public (RLS enforces access control —
see below), it is safe to bake it into the static client bundle.

### Base path

Vite's `base` is read from `VITE_BASE_PATH` (see `vite.config.ts`), defaulting to
`/kanban-simple/`. If you rename the repository or deploy under a different path,
override `VITE_BASE_PATH` (as a build-time env var, or by editing the default in
`vite.config.ts`) to match.

### SPA routing on GitHub Pages

GitHub Pages serves static files only, so deep links (e.g. `/board/<id>`) 404 on a
hard refresh. This is solved with the standard [spa-github-pages](https://github.com/rafgraph/spa-github-pages)
technique:

- `public/404.html` encodes the requested path into a query string and redirects to the
  app's root.
- An inline script in `index.html` decodes that query string back into the real URL via
  `history.replaceState` before React Router mounts, so the correct route renders.

## Database schema & Row Level Security

Tables: `profiles`, `projects`, `columns`, `tasks`, `subtasks`, `tags`, `task_tags`,
`activity_log`. Every table has a UUID primary key, `created_at`/`updated_at`
timestamps (auto-maintained by a trigger), foreign keys with `on delete cascade`, and
indexes on the columns used for lookups and ordering.

Row Level Security is enabled on every table with policies of the form
`auth.uid() = user_id`, so a user can only ever read or write their own rows — this is
enforced in Postgres, not just in the client. `user_id` is denormalized onto every
table (rather than requiring joins in RLS policies) for simpler policies and faster
queries.

## Recurring tasks

Recurrence (`none` / `daily` / `weekly` / `monthly` / `custom`) is stored directly on
the `tasks` row. A Postgres trigger (`spawn_recurring_task`, in
`supabase/migrations/20260703000000_initial_schema.sql`) fires whenever a recurring
task's `completed_at` transitions from `null` to a timestamp: it leaves the completed
task untouched (so completion history is retained) and inserts a new task in the same
column with `start_date`/`due_date` shifted forward, linked back to the original via
`recurrence_parent_id`.

This is intentionally implemented as a lightweight, synchronous SQL trigger rather than
a scheduled job, so it works with zero infrastructure beyond the database. The `custom`
recurrence type stores a cron expression on the task but currently falls back to a
daily shift — the schema and trigger are structured so this logic can be lifted into a
Supabase Edge Function or `pg_cron` job later (for real cron parsing, look-ahead
generation, etc.) without changing the table structure.

## Account deletion

Deleting all of a user's app data (projects, columns, tasks, subtasks, tags,
activity log) happens automatically via cascading foreign keys once their `profiles`
row is removed. Deleting the underlying Supabase Auth user requires elevated
privileges; this is handled by the `delete_own_account()` Postgres function
(`supabase/migrations/20260703000001_delete_account_rpc.sql`), a `security definer`
function that the Settings page calls via `supabase.rpc('delete_own_account')`. See the
comments in that migration if you're running against a self-hosted Supabase stack where
the `postgres` role may not have the same rights over the `auth` schema.

## Known simplifications

Built to be a solid, extensible foundation rather than to exhaustively gold-plate every
edge case:

- Custom cron recurrence is stored and displayed, but the automatic engine currently
  treats it the same as daily — full cron parsing is left for a future Edge Function.
- Task ordering/positions are recomputed among the currently *visible* (filtered) tasks
  when reordering; tasks hidden by an active filter keep their previous position value
  and may need a manual nudge to their exact order after filters are cleared.
- Large boards (many hundreds of tasks per column) are not virtualized; TanStack Query's
  caching and Vite's code-splitting keep the app fast for typical project sizes.

## Roadmap-ready architecture

The schema and client structure were designed so the following can be layered on
without a rewrite: teams/organisations, shared projects, real-time collaboration
(Supabase Realtime is a drop-in for the existing tables), comments, file attachments
(Supabase Storage bucket already referenced in `.env.example`), calendar/timeline
views, notifications, time tracking, an AI assistant, Edge Functions, and PWA/offline
support.

## Scripts

| Command          | Description                          |
| ---------------- | ------------------------------------- |
| `npm run dev`     | Start the Vite dev server             |
| `npm run build`   | Type-check and build for production   |
| `npm run preview` | Preview the production build locally  |
| `npm run lint`    | Run ESLint                            |
| `npm run format`  | Format the codebase with Prettier     |
