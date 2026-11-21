-- Board-query performance: evaluate auth.uid() once per query in RLS, and
-- index the board's main task query.
--
-- 1. RLS. Every policy compares against a bare auth.uid(), which Postgres
--    re-evaluates for every row it checks (Supabase's performance advisor
--    flags this as auth_rls_initplan). Wrapped as (select auth.uid()) it
--    becomes an initPlan, computed once per statement. The board's task
--    query reads tasks, subtasks, task_tags and tags in one request, so the
--    per-row cost scaled with board size on four tables at once.
--
--    Rather than restate ~30 policies by hand -- several were rewritten by
--    later hardening migrations, and a transcription slip here would
--    silently change who can see what -- this rewrites each live policy's
--    own expressions in place, changing nothing but the auth.uid() calls.
--    The lookbehind skips calls that are already wrapped, so re-running is
--    a no-op. A final check fails the migration if any bare call remains.
--
--    One catch: tasks_insert_own / tasks_update_own check a non-null
--    recurrence_parent_id with a subquery on tasks itself. Postgres refuses
--    to expand a table's policy inside itself once the inner policy has a
--    sublink of its own, so wrapping tasks_select_own would make every task
--    insert and update fail with "infinite recursion detected in policy".
--    Those two policies are therefore restated first with the ownership
--    check moved into private.is_own_task(): same question ("does the
--    caller own this task?"), answered by a SECURITY DEFINER function that
--    filters on the caller explicitly instead of going through tasks' RLS.
--    It lives in a schema PostgREST doesn't expose, so it isn't an RPC.
--
-- 2. Index. The board loads a project's active tasks ordered by
--    (position, id). The existing index on project_id alone finds the rows
--    but leaves the archived ones to filter and everything to sort; this
--    partial index serves the filter and the order directly, and stays
--    small because archived tasks aren't in it.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_own_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id and t.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_own_task(uuid) from public;
grant execute on function private.is_own_task(uuid) to authenticated;

-- Same conditions as 20260709071100_fix_recurrence_parent_id_rls_self_join_shadowing.sql,
-- with auth.uid() wrapped and the self-referencing subquery replaced.
drop policy if exists "tasks_insert_own" on public.tasks;
create policy "tasks_insert_own" on public.tasks
  for insert with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid()))
    and exists (select 1 from public.columns c where c.id = column_id and c.user_id = (select auth.uid()))
    and (recurrence_parent_id is null or private.is_own_task(recurrence_parent_id))
  );

drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own" on public.tasks
  for update using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid()))
    and exists (select 1 from public.columns c where c.id = column_id and c.user_id = (select auth.uid()))
    and (recurrence_parent_id is null or private.is_own_task(recurrence_parent_id))
  );

do $$
declare
  pol record;
  bare constant text := '(?<!SELECT )auth\.uid\(\)';
  stmt text;
begin
  for pol in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (qual ~ bare or with_check ~ bare)
  loop
    stmt := format('alter policy %I on public.%I', pol.policyname, pol.tablename);
    if pol.qual is not null then
      stmt := stmt || format(' using (%s)', regexp_replace(pol.qual, bare, '(select auth.uid())', 'g'));
    end if;
    if pol.with_check is not null then
      stmt := stmt || format(
        ' with check (%s)', regexp_replace(pol.with_check, bare, '(select auth.uid())', 'g')
      );
    end if;
    execute stmt;
  end loop;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and (qual ~ bare or with_check ~ bare)
  ) then
    raise exception 'RLS rewrite incomplete: a public policy still calls auth.uid() per row';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tasks'
      and (qual ~* '\mfrom\s+(public\.)?tasks\M' or with_check ~* '\mfrom\s+(public\.)?tasks\M')
  ) then
    raise exception 'a tasks policy queries tasks itself; with wrapped auth.uid() that recurses';
  end if;
end;
$$;

create index if not exists tasks_project_active_position_idx
  on public.tasks (project_id, position, id)
  where not is_archived;
