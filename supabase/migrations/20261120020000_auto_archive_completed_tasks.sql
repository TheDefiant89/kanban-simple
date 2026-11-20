-- Auto-archive completed tasks after a per-account number of days.
--
-- Boards load every non-archived task, completed ones included (they are
-- hidden client-side unless "Show completed" is on). Completed tasks pile up
-- -- especially from recurring tasks, which leave one completed copy behind
-- per occurrence -- so a busy board was mostly finished work, loaded on every
-- visit. Archived tasks are only fetched on demand (the board's Archived
-- panel), so archiving old completed work keeps boards small.
--
-- profiles.auto_archive_days: null = off, otherwise one of 7/14/30/90
-- (the options offered in Settings). Defaults to 14 for every account.
--
-- A task is archived once both completed_at and updated_at are older than
-- the threshold. The updated_at condition means a task someone just
-- unarchived (or edited) isn't re-archived by the next nightly run; it gets
-- the full window again.

alter table public.profiles
  add column if not exists auto_archive_days integer default 14
    constraint profiles_auto_archive_days_check
      check (auto_archive_days is null or auto_archive_days in (7, 14, 30, 90));

create or replace function public.auto_archive_completed_tasks()
returns integer
language plpgsql
set search_path = public
as $$
declare
  archived integer;
begin
  update tasks t
  set is_archived = true
  from profiles p
  where p.id = t.user_id
    and p.auto_archive_days is not null
    and t.is_archived = false
    and t.completed_at is not null
    and t.completed_at < now() - make_interval(days => p.auto_archive_days)
    and t.updated_at < now() - make_interval(days => p.auto_archive_days);
  get diagnostics archived = row_count;
  return archived;
end;
$$;

-- Only the scheduled job (which runs as postgres) calls this; it isn't an
-- RPC for clients.
revoke all on function public.auto_archive_completed_tasks() from public, anon, authenticated;

-- Speeds up the board's Archived panel (archived tasks of one project,
-- newest first) without touching the hot path for active tasks.
create index if not exists tasks_project_archived_idx
  on public.tasks (project_id, updated_at desc)
  where is_archived;

create extension if not exists pg_cron;

-- Nightly at 03:17 UTC. cron.schedule with an existing job name replaces it,
-- so re-running this migration is safe.
select cron.schedule(
  'auto-archive-completed-tasks',
  '17 3 * * *',
  $$select public.auto_archive_completed_tasks()$$
);
