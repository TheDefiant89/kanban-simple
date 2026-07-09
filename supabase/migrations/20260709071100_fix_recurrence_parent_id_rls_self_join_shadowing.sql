-- Fixes a correctness bug introduced by
-- 20260705000001_harden_recurrence_parent_id_rls.sql (#11).
--
-- That migration's exists() subquery aliased public.tasks as "rt" and wrote
-- an unqualified "recurrence_parent_id" in its WHERE clause:
--
--   exists (select 1 from public.tasks rt where rt.id = recurrence_parent_id ...)
--
-- Because "rt" is itself the tasks table, the unqualified column reference
-- is resolved against the innermost scope (rt), not the outer row being
-- inserted/updated. Postgres silently rewrote this as
-- "rt.id = rt.recurrence_parent_id" (verified live via pg_get_expr), which
-- asks "does a task exist that is its own recurrence parent" — always false,
-- since no task can reference itself. The net effect: the with_check clause
-- rejected every insert/update where recurrence_parent_id was non-null,
-- rather than validating its ownership.
--
-- No security regression resulted (fails closed, and the only writer,
-- spawn_recurring_task(), is security definer under a bypassrls role), but
-- the check didn't do what it claimed to. Rewrite it with an "in (select
-- id from tasks where user_id = ...)" form, which references
-- recurrence_parent_id only outside the correlated subquery and so can't be
-- shadowed the same way.

drop policy if exists "tasks_insert_own" on public.tasks;
create policy "tasks_insert_own" on public.tasks
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
    and exists (select 1 from public.columns c where c.id = column_id and c.user_id = auth.uid())
    and (
      recurrence_parent_id is null
      or recurrence_parent_id in (select id from public.tasks where user_id = auth.uid())
    )
  );

drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own" on public.tasks
  for update using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
    and exists (select 1 from public.columns c where c.id = column_id and c.user_id = auth.uid())
    and (
      recurrence_parent_id is null
      or recurrence_parent_id in (select id from public.tasks where user_id = auth.uid())
    )
  );
