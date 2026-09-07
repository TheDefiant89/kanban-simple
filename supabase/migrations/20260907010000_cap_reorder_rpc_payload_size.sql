-- Fixes GitHub issue #75: reorder_tasks / reorder_columns (added by
-- 20260705000003_add_reorder_rpcs.sql) accept an unbounded jsonb array. Every
-- other user-writable payload in the schema has a size/length cap, but these
-- RPCs would happily expand a multi-million-element array via
-- jsonb_array_elements, giving an authenticated user a cheap way to burn CPU
-- and memory on the database.
--
-- A real drag-and-drop reorder only ever writes the rows whose position or
-- column actually changed (see src/features/board/reorder.ts), spanning at
-- most two columns, so the caps below sit far above anything the client
-- sends while still bounding the worst case. Guarding requires a statement
-- before the UPDATE, so the functions move from `language sql` to
-- `language plpgsql`; everything else (security invoker, pinned search_path,
-- the RLS-governed UPDATE, the defense-in-depth user_id predicate) is
-- unchanged. CREATE OR REPLACE preserves the existing grants, which are
-- re-asserted here so a fresh setup is self-contained.

create or replace function public.reorder_tasks(updates jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if jsonb_typeof(updates) is distinct from 'array' then
    raise exception 'updates must be a jsonb array' using errcode = '22023';
  end if;
  if jsonb_array_length(updates) > 2000 then
    raise exception 'too many task updates: % (max 2000)', jsonb_array_length(updates)
      using errcode = '22023';
  end if;

  update tasks t
  set position = (u->>'position')::int,
      column_id = coalesce((u->>'column_id')::uuid, t.column_id)
  from jsonb_array_elements(updates) as u
  where t.id = (u->>'id')::uuid
    and t.user_id = auth.uid();
end;
$$;

create or replace function public.reorder_columns(updates jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if jsonb_typeof(updates) is distinct from 'array' then
    raise exception 'updates must be a jsonb array' using errcode = '22023';
  end if;
  if jsonb_array_length(updates) > 500 then
    raise exception 'too many column updates: % (max 500)', jsonb_array_length(updates)
      using errcode = '22023';
  end if;

  update columns c
  set position = (u->>'position')::int
  from jsonb_array_elements(updates) as u
  where c.id = (u->>'id')::uuid
    and c.user_id = auth.uid();
end;
$$;

revoke all on function public.reorder_tasks(jsonb) from public;
revoke execute on function public.reorder_tasks(jsonb) from anon;
grant execute on function public.reorder_tasks(jsonb) to authenticated;

revoke all on function public.reorder_columns(jsonb) from public;
revoke execute on function public.reorder_columns(jsonb) from anon;
grant execute on function public.reorder_columns(jsonb) to authenticated;
