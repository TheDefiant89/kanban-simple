-- Fixes GitHub issue #22: the FK-ownership hardening in
-- 20260705000000_harden_fk_ownership_rls.sql and
-- 20260705000001_harden_recurrence_parent_id_rls.sql covered columns, tasks,
-- subtasks, and task_tags, but missed activity_log. That left
-- activity_log_insert_own checking only auth.uid() = user_id, so an
-- authenticated user could insert a row with project_id/task_id pointing at
-- another tenant's row -- mislinking cross-tenant rows and acting as a UUID
-- existence oracle (insert succeeds vs. FK-violation reveals whether an
-- arbitrary id exists at all, regardless of owner) -- the same risk class #2
-- and #11 closed for other tables, on a table those fixes didn't reach.
--
-- Tighten activity_log_insert_own's with_check to also require any non-null
-- project_id/task_id to belong to the caller.

drop policy if exists "activity_log_insert_own" on public.activity_log;
create policy "activity_log_insert_own" on public.activity_log
  for insert with check (
    auth.uid() = user_id
    and (
      project_id is null
      or exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
    )
    and (
      task_id is null
      or exists (select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid())
    )
  );
