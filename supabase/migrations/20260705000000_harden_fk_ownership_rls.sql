-- Fixes GitHub issue #2: RLS insert/update policies only checked that a
-- row's own user_id matched auth.uid(), never that the foreign keys the row
-- references (project_id, column_id, task_id, tag_id) actually belong to
-- that same user. That let an authenticated user attach their own rows to
-- another user's parent resources, and doubled as a cross-tenant UUID
-- existence oracle (insert succeeds vs. FK-violation reveals whether a
-- given id exists at all, regardless of owner).
--
-- Tighten every affected with_check/using clause to also require the
-- referenced parent row to belong to auth.uid().

-- columns: project_id must belong to the caller.
drop policy if exists "columns_insert_own" on public.columns;
create policy "columns_insert_own" on public.columns
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  );

drop policy if exists "columns_update_own" on public.columns;
create policy "columns_update_own" on public.columns
  for update using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  );

-- tasks: project_id and column_id must belong to the caller.
drop policy if exists "tasks_insert_own" on public.tasks;
create policy "tasks_insert_own" on public.tasks
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
    and exists (select 1 from public.columns c where c.id = column_id and c.user_id = auth.uid())
  );

drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own" on public.tasks
  for update using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
    and exists (select 1 from public.columns c where c.id = column_id and c.user_id = auth.uid())
  );

-- subtasks: task_id must belong to the caller.
drop policy if exists "subtasks_insert_own" on public.subtasks;
create policy "subtasks_insert_own" on public.subtasks
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid())
  );

drop policy if exists "subtasks_update_own" on public.subtasks;
create policy "subtasks_update_own" on public.subtasks
  for update using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid())
  );

-- task_tags: both task_id and tag_id must belong to the caller.
drop policy if exists "task_tags_insert_own" on public.task_tags;
create policy "task_tags_insert_own" on public.task_tags
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid())
    and exists (select 1 from public.tags g where g.id = tag_id and g.user_id = auth.uid())
  );
