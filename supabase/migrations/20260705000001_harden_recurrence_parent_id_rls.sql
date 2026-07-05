-- Fixes GitHub issue #11: the FK-ownership hardening in
-- 20260705000000_harden_fk_ownership_rls.sql covered project_id, column_id,
-- task_id, and tag_id, but missed tasks.recurrence_parent_id. That left an
-- authenticated user free to point recurrence_parent_id at any task row in
-- the database (not just their own) via a direct PostgREST call, which both
-- mislinks cross-tenant rows and acts as a UUID existence oracle (insert/
-- update succeeds vs. FK-violation reveals whether an arbitrary task id
-- exists at all, regardless of owner) — the same risk class #2 closed for
-- the other foreign keys, on a column that fix didn't reach.
--
-- Tighten tasks_insert_own/tasks_update_own's with_check to also require
-- recurrence_parent_id (when non-null) to belong to the caller.

drop policy if exists "tasks_insert_own" on public.tasks;
create policy "tasks_insert_own" on public.tasks
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
    and exists (select 1 from public.columns c where c.id = column_id and c.user_id = auth.uid())
    and (
      recurrence_parent_id is null
      or exists (select 1 from public.tasks rt where rt.id = recurrence_parent_id and rt.user_id = auth.uid())
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
      or exists (select 1 from public.tasks rt where rt.id = recurrence_parent_id and rt.user_id = auth.uid())
    )
  );
